import type { ServerConfig } from './config';

/** Server-side AI provider contract. Swap or add providers here without touching the client. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  completeJson(system: string, user: string, signal: AbortSignal): Promise<string>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const msg = typeof body.error === 'string' ? body.error : body.error?.message;
    return msg ? msg.slice(0, 200) : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function openAiCompatible(cfg: ServerConfig): AiProvider {
  return {
    name: cfg.baseUrl.includes('api.openai.com') ? 'OpenAI' : 'OpenAI-compatible',
    model: cfg.model,
    async completeJson(system, user, signal) {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) throw new ProviderError(`Provider error: ${await readError(res)}`, res.status === 429 ? 429 : 502);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new ProviderError('The provider returned an empty response.');
      return text;
    },
  };
}

function anthropic(cfg: ServerConfig): AiProvider {
  return {
    name: 'Anthropic',
    model: cfg.model,
    async completeJson(system, user, signal) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 4096,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new ProviderError(`Provider error: ${await readError(res)}`, res.status === 429 ? 429 : 502);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = data.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      if (!text) throw new ProviderError('The provider returned an empty response.');
      return text;
    },
  };
}

export function createProvider(cfg: ServerConfig): AiProvider | null {
  if (cfg.provider === 'openai') return openAiCompatible(cfg);
  if (cfg.provider === 'anthropic') return anthropic(cfg);
  return null;
}

/** Extracts the first JSON object from a model reply (tolerates code fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new ProviderError('The provider reply did not contain JSON.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ProviderError('The provider reply contained invalid JSON.');
  }
}
