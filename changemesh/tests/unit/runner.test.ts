import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makePdf } from "../helpers/pdf";

vi.mock("server-only", () => ({}));
const { DemoWorkspaceData } = await import("@/server/data/demo");
const { ingestUpload, scanWebsite } = await import("@/server/intelligence/runner");

const enc = (s: string) => new TextEncoder().encode(s);

async function setup() {
  const data = new DemoWorkspaceData(crypto.randomUUID());
  const { id } = await data.createAsset({ type: "csv", name: "Spring prices", description: null, sourceUrl: null });
  const asset = async () => (await data.snapshot()).assets.find((a) => a.id === id)!;
  return { data, id, asset };
}

describe("ingestUpload", () => {
  it("creates version 1 with facts from a CSV and reports it", async () => {
    const { data, id, asset } = await setup();
    const out = await ingestUpload(data, await asset(), { name: "prices.csv", bytes: enc("Item,Price\nBurger,$15\nRisotto,$19\n") });
    expect(out).toMatchObject({ status: "succeeded", factsCount: 2, assetVersion: 1, newVersion: true });
    expect(out.message).toBe("Scan complete (v1): 2 facts extracted.");
    const a = await asset();
    expect(a).toMatchObject({ scanStatus: "succeeded", currentVersion: 1, mimeType: "text/csv" });
    const intel = await data.assetIntelligence(id);
    expect(intel.facts.map((f) => [f.entityName, f.normalizedValue])).toEqual([
      ["Burger", "USD 15.00"],
      ["Risotto", "USD 19.00"],
    ]);
    expect(intel.scans[0]).toMatchObject({ status: "succeeded", factsCount: 2, assetVersion: 1, kind: "upload" });
  });

  it("does not create a new version for an identical file", async () => {
    const { data, asset } = await setup();
    const bytes = enc("Item,Price\nBurger,$15\n");
    await ingestUpload(data, await asset(), { name: "p.csv", bytes });
    const again = await ingestUpload(data, await asset(), { name: "p.csv", bytes });
    expect(again).toMatchObject({ newVersion: false, assetVersion: 1, factsCount: 1 });
    expect(again.message).toMatch(/No changes since v1/);
  });

  it("creates version 2 for changed content; version 1 facts become history", async () => {
    const { data, id, asset } = await setup();
    await ingestUpload(data, await asset(), { name: "p.csv", bytes: enc("Item,Price\nBurger,$12\n") });
    await ingestUpload(data, await asset(), { name: "p.csv", bytes: enc("Item,Price\nBurger,$15\n") });
    const intel = await data.assetIntelligence(id);
    expect(intel.facts.map((f) => f.normalizedValue)).toEqual(["USD 15.00"]);
    expect((await asset()).currentVersion).toBe(2);
    expect((await data.snapshot()).factCounts[id]).toBe(1);
  });

  it("records partial results honestly (malformed rows)", async () => {
    const { data, asset } = await setup();
    const out = await ingestUpload(data, await asset(), { name: "p.csv", bytes: enc("Item,Price\nBurger,$15\nBad,row,extra\n") });
    expect(out.status).toBe("partial");
    expect((await asset()).lastScanError).toMatch(/different number of columns/);
  });

  it("records unsupported files as failed scans and keeps the previous version", async () => {
    const { data, id, asset } = await setup();
    await ingestUpload(data, await asset(), { name: "p.csv", bytes: enc("Item,Price\nBurger,$15\n") });
    const out = await ingestUpload(data, await asset(), { name: "sheet.xlsx", bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]) });
    expect(out.status).toBe("failed");
    expect(out.message).toMatch(/Office documents/);
    const a = await asset();
    expect(a).toMatchObject({ scanStatus: "failed", currentVersion: 1 });
    expect((await data.assetIntelligence(id)).facts).toHaveLength(1); // previous facts kept
  });

  it("reads PDFs and reports image-only pages as partial", async () => {
    const { data, asset } = await setup();
    const out = await ingestUpload(data, await asset(), { name: "menu.pdf", bytes: makePdf(["Classic Burger ........ $15.00", ""]) });
    expect(out.status).toBe("partial");
    expect(out.factsCount).toBe(1);
    expect((await asset()).lastScanError).toMatch(/1 of 2 page\(s\) contain no extractable text/);
  });

  it("fails PDFs without any text instead of claiming success", async () => {
    const { data, asset } = await setup();
    const out = await ingestUpload(data, await asset(), { name: "scan.pdf", bytes: makePdf(["", ""]) });
    expect(out.status).toBe("failed");
    expect(out.message).toMatch(/no extractable text/);
  });

  it("refuses a second scan while one is running", async () => {
    const { data, id } = await setup();
    await data.startScan(id, "upload");
    await expect(data.startScan(id, "upload")).rejects.toThrow(/already running/);
  });
});

describe("scanWebsite", () => {
  let server: http.Server;
  let port: string;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/menu") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end('<html><title>Spring menu</title><body><ul><li>Burger ........ $15.00</li></ul><a href="tel:+15550142">Call</a></body></html>');
      } else {
        res.writeHead(503, { "content-type": "text/html" });
        res.end("down");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = String((server.address() as AddressInfo).port);
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  const fetchOptions = () => ({ resolve: async () => [{ address: "127.0.0.1", family: 4 }], isAllowedAddress: (ip: string) => ip === "127.0.0.1", allowedPorts: new Set([port]) });

  it("scans a page into facts and a new version", async () => {
    const data = new DemoWorkspaceData(crypto.randomUUID());
    const { id } = await data.createAsset({ type: "website", name: "Spring page", description: null, sourceUrl: `http://shop.example.test:${port}/menu` });
    const asset = (await data.snapshot()).assets.find((a) => a.id === id)!;
    const out = await scanWebsite(data, asset, fetchOptions());
    expect(out.status).toBe("succeeded");
    const facts = (await data.assetIntelligence(id)).facts;
    expect(facts.find((f) => f.attributeName === "price")?.normalizedValue).toBe("USD 15.00");
    expect(facts.find((f) => f.attributeName === "phone")?.normalizedValue).toBe("+15550142");
    expect(facts.find((f) => f.attributeName === "page title")?.valueText).toBe("Spring menu");
  });

  it("records HTTP errors as failed scans", async () => {
    const data = new DemoWorkspaceData(crypto.randomUUID());
    const { id } = await data.createAsset({ type: "website", name: "Down page", description: null, sourceUrl: `http://shop.example.test:${port}/down` });
    const asset = (await data.snapshot()).assets.find((a) => a.id === id)!;
    const out = await scanWebsite(data, asset, fetchOptions());
    expect(out).toMatchObject({ status: "failed", factsCount: 0 });
    expect(out.message).toMatch(/HTTP 503/);
    expect((await data.assetIntelligence(id)).scans[0]?.error).toMatch(/HTTP 503/);
  });

  it("blocks internal targets with the default policy", async () => {
    const data = new DemoWorkspaceData(crypto.randomUUID());
    const { id } = await data.createAsset({ type: "website", name: "Metadata", description: null, sourceUrl: "http://169.254.169.254/latest/meta-data/" });
    const asset = (await data.snapshot()).assets.find((a) => a.id === id)!;
    const out = await scanWebsite(data, asset);
    expect(out.status).toBe("failed");
    expect(out.message).toMatch(/private or internal/);
  });
});
