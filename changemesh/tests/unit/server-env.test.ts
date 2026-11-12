import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parseServerEnv } = await import("@/server/env.server");

describe("server env", () => {
  it("defaults demo mode to disabled and log level to info", () => {
    const env = parseServerEnv({});
    expect(env.CHANGEMESH_DEMO_MODE).toBe("disabled");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("rejects unknown demo mode values", () => {
    expect(() => parseServerEnv({ CHANGEMESH_DEMO_MODE: "yes" })).toThrow(/CHANGEMESH_DEMO_MODE/);
  });

  it("never includes secret values in validation errors", () => {
    try {
      parseServerEnv({ LOG_LEVEL: "loud", SUPABASE_SERVICE_ROLE_KEY: "super-secret-value" });
    } catch (e) {
      expect(String(e)).not.toContain("super-secret-value");
    }
  });
});
