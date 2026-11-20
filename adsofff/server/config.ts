export interface ServerConfig {
  port: number;
  provider: 'openai' | 'anthropic' | null;
  apiKey: string;
  model: string;
  baseUrl: string;
  limitPerClient: number;
  limitTotal: number;
  /** OpenAI path: 'auto' uses strict JSON schema only on api.openai.com; 'on'/'off' force it. */
  structuredOutput: 'auto' | 'on' | 'off';
  problem: string | null;
}

function int(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Reads configuration from environment variables only. Secrets are never logged or returned. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const raw = (env.AI_PROVIDER ?? '').trim().toLowerCase();
  const provider = raw === 'openai' || raw === 'anthropic' ? raw : null;
  const apiKey = (env.AI_API_KEY ?? '').trim();
  const model = (env.AI_MODEL ?? '').trim();
  let problem: string | null = null;
  if (!raw) problem = 'No AI provider is configured on the server.';
  else if (!provider) problem = `Unsupported AI_PROVIDER "${raw}". Use "openai" or "anthropic".`;
  else if (!apiKey) problem = 'AI_API_KEY is not set on the server.';
  else if (!model) problem = 'AI_MODEL is not set on the server.';
  const baseUrl = (env.AI_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (!problem && baseUrl && !/^https:\/\/[^\s/]+/i.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(baseUrl))
    problem = 'AI_BASE_URL must use https:// (http:// is only allowed for localhost).';
  return {
    port: int(env.ADSOFFF_SERVER_PORT ?? env.PORT, 8787),
    provider: problem ? null : provider,
    apiKey,
    model,
    baseUrl,
    structuredOutput: (['on', 'off'] as const).find((v) => v === (env.AI_STRUCTURED_OUTPUT ?? '').trim().toLowerCase()) ?? 'auto',
    limitPerClient: int(env.AI_DAILY_LIMIT_PER_CLIENT, 20),
    limitTotal: int(env.AI_DAILY_LIMIT_TOTAL, 200),
    problem,
  };
}
