import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { createProvider, ProviderError } from './providers';

interface Captured {
  path: string;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

const concept = { title: 'T', mainIdea: 'I', audience: 'A', angle: 'G', emotionalTrigger: 'E', hook: 'H', message: 'M', cta: 'C', visualDirection: 'V' };
let mode: 'ok' | 'refusal' | 'unauthorized' | 'ratelimit' | 'badjson' = 'ok';
const seen: Captured[] = [];
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push({ path: req.url ?? '', headers: req.headers, body: JSON.parse(raw || '{}') });
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (mode === 'unauthorized') return json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (mode === 'ratelimit') return json(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } });
      const text = mode === 'badjson' ? '{"concepts":[{"title":1}]}' : JSON.stringify({ concepts: [concept] });
      if (req.url?.startsWith('/v1/messages')) {
        return json(200, {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'test-model',
          content: mode === 'refusal' ? [] : [{ type: 'text', text }],
          stop_reason: mode === 'refusal' ? 'refusal' : 'end_turn',
          stop_sequence: null,
          stop_details: mode === 'refusal' ? { type: 'refusal', category: null, explanation: null } : null,
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      }
      return json(200, {
        id: 'chatcmpl_1',
        object: 'chat.completion',
        created: 1,
        model: 'test-model',
        choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: mode === 'refusal' ? null : text, refusal: mode === 'refusal' ? 'No.' : null } }],
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const signal = () => new AbortController().signal;
const SECRET = 'sk-test-secret-123';

describe('Anthropic provider (official SDK, structured output)', () => {
  const make = () => createProvider(loadConfig({ AI_PROVIDER: 'anthropic', AI_API_KEY: SECRET, AI_MODEL: 'test-model', AI_BASE_URL: base }))!;
  it('ignores ambient base-URL environment variables', () => {
    expect(loadConfig({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'k', AI_MODEL: 'm' }).baseUrl).toBe('');
  });
  it('sends the key in an auth header and requests a JSON-schema output format', async () => {
    mode = 'ok';
    seen.length = 0;
    const out = await make().generate('concepts', 'sys', 'user', signal());
    expect(out.concepts[0].title).toBe('T');
    const req = seen[0];
    expect(req.path.startsWith('/v1/messages')).toBe(true);
    // The official SDK chooses the auth header and API version; we only assert the key travels in a header.
    expect([req.headers['x-api-key'], req.headers.authorization]).toContain(req.headers['x-api-key'] ? SECRET : `Bearer ${SECRET}`);
    expect(req.headers['anthropic-version']).toBeTruthy();
    expect(req.body.system).toBe('sys');
    expect(req.body.max_tokens).toBe(16000);
    expect((req.body.output_config as { format: { type: string } }).format.type).toBe('json_schema');
  });
  it('maps refusal, auth and rate-limit errors without leaking the key', async () => {
    for (const [m, status] of [['refusal', 422], ['unauthorized', 502], ['ratelimit', 429]] as const) {
      mode = m;
      const err = await make().generate('concepts', 's', 'u', signal()).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err.status).toBe(status);
      expect(String(err.message)).not.toContain(SECRET);
    }
  });
});

describe('OpenAI provider (official SDK)', () => {
  it('uses strict JSON schema and max_completion_tokens when structured output is on', async () => {
    const provider = createProvider(loadConfig({ AI_PROVIDER: 'openai', AI_API_KEY: SECRET, AI_MODEL: 'test-model', AI_BASE_URL: `${base}/v1`, AI_STRUCTURED_OUTPUT: 'on' }))!;
    mode = 'ok';
    seen.length = 0;
    const out = await provider.generate('concepts', 'sys', 'user', signal());
    expect(out.concepts).toHaveLength(1);
    const req = seen[0];
    expect(req.path).toBe('/v1/chat/completions');
    expect(req.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(req.body.max_completion_tokens).toBe(16000);
    expect(req.body.max_tokens).toBeUndefined();
    const rf = req.body.response_format as { type: string; json_schema: { strict: boolean } };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.strict).toBe(true);
    mode = 'refusal';
    expect((await provider.generate('concepts', 's', 'u', signal()).catch((e) => e)).status).toBe(422);
  });
  it('falls back to json_object + Zod validation for compatible endpoints', async () => {
    const provider = createProvider(loadConfig({ AI_PROVIDER: 'openai', AI_API_KEY: SECRET, AI_MODEL: 'test-model', AI_BASE_URL: `${base}/v1` }))!;
    expect(provider.name).toBe('OpenAI-compatible');
    mode = 'ok';
    seen.length = 0;
    await provider.generate('concepts', 's', 'u', signal());
    expect((seen[0].body.response_format as { type: string }).type).toBe('json_object');
    mode = 'badjson';
    const err = await provider.generate('concepts', 's', 'u', signal()).catch((e) => e);
    expect(err.message).toMatch(/expected format/);
  });
});

describe('config safety', () => {
  it('rejects insecure base URLs and unknown structured-output values', () => {
    expect(loadConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_MODEL: 'm', AI_BASE_URL: 'http://evil.example/v1' }).problem).toMatch(/https/);
    expect(loadConfig({ AI_PROVIDER: 'openai', AI_API_KEY: 'k', AI_MODEL: 'm', AI_STRUCTURED_OUTPUT: 'maybe' }).structuredOutput).toBe('auto');
  });
});
