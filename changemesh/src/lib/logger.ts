/**
 * Minimal structured JSON logger.
 * - One JSON object per line (works with Vercel, Datadog, Logtail, etc.).
 * - Redacts fields whose names look like secrets.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|service[-_]?role)/i;
const MAX_DEPTH = 5;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[Truncated]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY.test(k) ? "[Redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function currentLevel(): LogLevel {
  const v = process.env.LOG_LEVEL;
  return v === "debug" || v === "info" || v === "warn" || v === "error" ? v : "info";
}

export interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  child(bindings: LogContext): Logger;
}

export function createLogger(bindings: LogContext = {}, sink: (line: string, level: LogLevel) => void = defaultSink): Logger {
  const write = (level: LogLevel, msg: string, ctx?: LogContext) => {
    if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel()]) return;
    const entry = { level, time: new Date().toISOString(), msg, ...(redact({ ...bindings, ...ctx }) as LogContext) };
    sink(JSON.stringify(entry), level);
  };
  return {
    debug: (m, c) => write("debug", m, c),
    info: (m, c) => write("info", m, c),
    warn: (m, c) => write("warn", m, c),
    error: (m, c) => write("error", m, c),
    child: (more) => createLogger({ ...bindings, ...more }, sink),
  };
}

function defaultSink(line: string, level: LogLevel) {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = createLogger({ service: "changemesh" });
