import { describe, expect, it } from "vitest";
import { isSupabaseConfigured, parsePublicEnv } from "./env";

describe("public env", () => {
  it("treats empty strings as unset", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(isSupabaseConfigured(env)).toBe(false);
  });

  it("detects a configured Supabase project", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    expect(isSupabaseConfigured(env)).toBe(true);
  });

  it("rejects malformed URLs without echoing values", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("parses the Google flag", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true" }).NEXT_PUBLIC_AUTH_GOOGLE_ENABLED).toBe(true);
    expect(parsePublicEnv({}).NEXT_PUBLIC_AUTH_GOOGLE_ENABLED).toBe(false);
  });
});
