import { describe, expect, it } from "vitest";
import { formatBytes, initials, relativeTime } from "./format";

describe("format", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  it("formats relative times", () => {
    expect(relativeTime("2026-11-12T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("2026-11-12T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-11-11T12:00:00Z", now)).toBe("yesterday");
    expect(relativeTime(null, now)).toBe("—");
  });
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1_842_311)).toBe("1.8 MB");
    expect(formatBytes(null)).toBe("—");
  });
  it("builds initials", () => {
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("Demo Visitor (you)")).toBe("DV");
    expect(initials("leyla")).toBe("LE");
    expect(initials(null)).toBe("?");
  });
});
