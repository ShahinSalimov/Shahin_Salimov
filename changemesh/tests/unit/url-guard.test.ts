import { describe, expect, it } from "vitest";
import { checkUrl, isPublicAddress } from "@/server/intelligence/url-guard";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "127.255.255.254", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.10",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::1",
  ])("blocks %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["93.184.216.34", "1.1.1.1", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2a00:1450:4001:80b::200e"])("allows %s", (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );

  it("rejects garbage", () => {
    expect(isPublicAddress("not-an-ip")).toBe(false);
    expect(isPublicAddress("1:2:3")).toBe(false);
  });
});

describe("checkUrl", () => {
  it("accepts normal public URLs", () => {
    expect(checkUrl("https://harborvine.example/menu?x=1").hostname).toBe("harborvine.example");
    expect(checkUrl("http://shop.example.com:80/").hostname).toBe("shop.example.com");
  });

  it.each([
    ["ftp://example.com/file", /Only http and https/],
    ["file:///etc/passwd", /Only http and https/],
    ["javascript:alert(1)", /Only http and https/],
    ["https://user:pass@example.com/", /credentials/],
    ["https://example.com:8080/", /standard web ports/],
    ["http://localhost/", /internal/],
    ["http://intranet/", /internal/],
    ["http://db.internal/", /internal/],
    ["http://printer.local/", /internal/],
    ["http://127.0.0.1/", /private or internal/],
    ["http://[::1]/", /private or internal/],
    ["http://169.254.169.254/latest/meta-data/", /private or internal/],
    ["http://2130706433/", /private or internal/], // decimal 127.0.0.1
    ["http://0x7f000001/", /private or internal/], // hex 127.0.0.1
    ["http://0177.0.0.1/", /private or internal/], // octal
    ["http://[::ffff:127.0.0.1]/", /private or internal/],
    ["not a url", /not a valid URL/],
  ])("rejects %s", (url, msg) => expect(() => checkUrl(url)).toThrow(msg));
});
