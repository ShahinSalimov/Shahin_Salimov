import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { detectFileKind, decodeTextFile, safeFileName } = await import("@/server/intelligence/files");
const { extractPdfText } = await import("@/server/intelligence/pdf");

import { makePdf } from "../helpers/pdf";

const enc = (s: string) => new TextEncoder().encode(s);

describe("detectFileKind", () => {
  it("recognizes files by content", () => {
    expect(detectFileKind(makePdf(["x"]), "menu.pdf")).toBe("pdf");
    expect(detectFileKind(makePdf(["x"]), "renamed.txt")).toBe("pdf");
    expect(detectFileKind(enc("a,b\n1,2"), "prices.csv")).toBe("csv");
    expect(detectFileKind(enc("hello"), "notes.md")).toBe("text");
  });

  it("rejects disguised, binary, unsupported and empty files", () => {
    expect(() => detectFileKind(enc("not a pdf"), "fake.pdf")).toThrow(/not a PDF/);
    expect(() => detectFileKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]), "sheet.xlsx")).toThrow(/Office documents/);
    expect(() => detectFileKind(new Uint8Array([1, 0, 2, 3]), "data.csv")).toThrow(/binary/);
    expect(() => detectFileKind(enc("x"), "image.png")).toThrow(/not supported/);
    expect(() => detectFileKind(new Uint8Array(), "a.csv")).toThrow(/empty/);
  });

  it("enforces size limits", () => {
    expect(() => detectFileKind(new Uint8Array(11 * 1024 * 1024), "big.pdf")).toThrow(/larger than 10 MB/);
    expect(() => detectFileKind(new Uint8Array(6 * 1024 * 1024).fill(65), "big.csv")).toThrow(/at most 5 MB/);
  });
});

describe("decodeTextFile", () => {
  it("strips the UTF-8 BOM", () => {
    expect(decodeTextFile(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])).text).toBe("A");
  });
  it("falls back to Windows-1252 with a warning", () => {
    const r = decodeTextFile(new Uint8Array([0x43, 0x61, 0x66, 0xe9]));
    expect(r.text).toBe("Café");
    expect(r.warning).toMatch(/not valid UTF-8/);
  });
});

describe("safeFileName", () => {
  it("removes path parts and odd characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\menu<script>.pdf")).toBe("menu_script_.pdf");
  });
});

describe("extractPdfText", () => {
  it("reads text per page and reports image-only pages", async () => {
    const r = await extractPdfText(makePdf(["Classic Burger ........ $15.00\nCall us: +1 555 0142", "", "Pumpkin Risotto $19.00"]));
    expect(r.numPages).toBe(3);
    expect(r.pages[0]).toContain("Classic Burger");
    expect(r.emptyPages).toEqual([2]);
    expect(r.truncated).toBe(false);
  });

  it("fails clearly on damaged PDFs", async () => {
    await expect(extractPdfText(enc("%PDF-1.4\ngarbage"))).rejects.toThrow(/could not be opened/);
  });
});
