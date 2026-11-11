import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config';
import { createProvider, ProviderError } from './providers';
import { DailyLimiter } from './limits';
import { buildPrompt, requestSchema, responseSchemas } from './tasks';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Minimal .env loader (no dependency). Values already in the environment win.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const cfg = loadConfig();
const provider = createProvider(cfg);
const limiter = new DailyLimiter(cfg.limitPerClient, cfg.limitTotal);
const DIST = join(ROOT, 'dist');
const MAX_BODY = 64 * 1024;
const TIMEOUT_MS = 60_000; // hard cap per request, on top of the SDK timeout

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

function clientId(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        chunks.length = 0;
        // Drain politely so the client receives a 413; cut off only abusive uploads.
        if (size > 1024 * 1024) req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => (tooLarge ? reject(new ProviderError('Request body is too large.', 413)) : resolveBody(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

async function handleGenerate(req: IncomingMessage, res: ServerResponse) {
  if (!provider) return send(res, 503, { error: cfg.problem ?? 'AI is not configured.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cross-origin requests are not allowed.' });
  if (!(req.headers['content-type'] ?? '').includes('application/json')) return send(res, 415, { error: 'Expected application/json.' });
  // The browser only sends this header after the user accepted the data notice in Settings.
  if (req.headers['x-adspark-consent'] !== 'granted') return send(res, 403, { error: 'AI generation needs your consent in Settings first.' });

  let json: unknown;
  try {
    json = JSON.parse(await readBody(req));
  } catch (e) {
    return send(res, e instanceof ProviderError ? e.status : 400, { error: e instanceof ProviderError ? e.message : 'Invalid JSON body.' });
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return send(res, 400, { error: `Invalid request: ${parsed.error.issues[0]?.message ?? 'validation failed'}` });

  const client = clientId(req);
  if (!limiter.take(client)) return send(res, 429, { error: 'Daily AI usage limit reached. Demo Generation is still available.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { system, user } = buildPrompt(parsed.data);
    const output = await provider.generate(parsed.data.task, system, user, controller.signal);
    // Second validation pass with the app's stricter limits before anything reaches the browser.
    const result = responseSchemas[parsed.data.task].safeParse(output);
    if (!result.success) return send(res, 502, { error: 'The AI response did not match the expected format. Try again or use the local engine.' });
    send(res, 200, result.data);
  } catch (e) {
    if (controller.signal.aborted) return send(res, 504, { error: 'The AI provider took too long to respond.' });
    const status = e instanceof ProviderError ? e.status : 502;
    send(res, status, { error: e instanceof ProviderError ? e.message : 'The AI provider could not be reached.' });
  } finally {
    clearTimeout(timer);
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};

async function serveStatic(pathname: string, res: ServerResponse) {
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('The app is not built yet. Run "npm run build" first, or use "npm run dev" for development.');
    return;
  }
  const safe = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = resolve(DIST, safe);
  if (!file.startsWith(DIST + sep) && file !== DIST) file = join(DIST, 'index.html');
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(DIST, 'index.html');
  } catch {
    file = join(DIST, 'index.html'); // SPA fallback
  }
  const ext = extname(file);
  const body = await readFile(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (url.pathname === '/api/ai/status' && req.method === 'GET') {
      return send(
        res,
        200,
        provider
          ? { enabled: true, provider: provider.name, model: provider.model, remainingToday: limiter.remaining(clientId(req)), limitPerClient: cfg.limitPerClient }
          : { enabled: false, reason: cfg.problem ?? 'AI is not configured.' },
      );
    }
    if (url.pathname === '/api/ai/generate') {
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
      return await handleGenerate(req, res);
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
    await serveStatic(url.pathname, res);
  } catch {
    if (!res.headersSent) send(res, 500, { error: 'Internal server error.' });
    else res.end();
  }
});

server.listen(cfg.port, '127.0.0.1', () => {
  console.log(`AdSpark server running at http://localhost:${cfg.port}`);
  console.log(provider ? `AI provider: ${provider.name} (${provider.model})` : `AI disabled: ${cfg.problem} Demo Generation (local templates, not AI) is used.`);
});
