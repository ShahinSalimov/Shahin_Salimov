import { describe, expect, it } from "vitest";
import { createLogger, redact } from "./logger";

describe("logger", () => {
  it("writes one JSON line with bindings and context", () => {
    const lines: string[] = [];
    const log = createLogger({ service: "test" }, (line) => lines.push(line)).child({ requestId: "r1" });
    log.info("hello", { workspaceId: "w1" });
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ level: "info", msg: "hello", service: "test", requestId: "r1", workspaceId: "w1" });
    expect(typeof entry.time).toBe("string");
  });

  it("redacts secret-looking keys at any depth", () => {
    expect(
      redact({ password: "p", nested: { apiKey: "k", access_token: "t", serviceRoleKey: "s", ok: 1 }, headers: { Authorization: "Bearer x", cookie: "c" } }),
    ).toEqual({ password: "[Redacted]", nested: { apiKey: "[Redacted]", access_token: "[Redacted]", serviceRoleKey: "[Redacted]", ok: 1 }, headers: { Authorization: "[Redacted]", cookie: "[Redacted]" } });
  });

  it("serializes errors", () => {
    const out = redact({ error: new Error("boom") }) as { error: { message: string } };
    expect(out.error.message).toBe("boom");
  });

  it("respects LOG_LEVEL", () => {
    const lines: string[] = [];
    const prev = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "warn";
    const log = createLogger({}, (l) => lines.push(l));
    log.info("skip");
    log.error("keep");
    process.env.LOG_LEVEL = prev;
    expect(lines).toHaveLength(1);
  });
});
