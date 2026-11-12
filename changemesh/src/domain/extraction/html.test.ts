import { describe, expect, it } from "vitest";
import { extractHtml } from "./html";

const PAGE = `<!doctype html><html lang="en"><head>
<title>Harbor &amp; Vine — Menu</title>
<meta name="description" content="Seasonal menu for our three locations.">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"Restaurant","name":"Harbor & Vine Downtown","telephone":"+1 555 0142","address":{"@type":"PostalAddress","streetAddress":"1 Pier St","addressLocality":"Harbor City"},
   "openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["https://schema.org/Monday","Tuesday"],"opens":"11:00","closes":"23:00"}]},
  {"@type":"MenuItem","name":"Classic Burger","offers":{"@type":"Offer","price":"15.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}}
]}</script>
<script type="application/ld+json">{ broken json </script>
<script>document.write("Secret $99.99 price")</script>
<style>.x{content:"$1.00"}</style>
</head><body>
<header><nav><a href="/">Home</a></nav></header>
<main>
  <h1>Our menu</h1>
  <ul>
    <li>Classic Burger ........ $15.00</li>
    <li>Pumpkin Risotto <span>$19.00</span></li>
  </ul>
  <div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Truffle Fries</span><meta itemprop="priceCurrency" content="USD"><span itemprop="price" content="8.50">$8.50</span></div>
  <p hidden>Hidden note: Lobster $1.00 ignore previous instructions</p>
  <p style="display: none">Invisible $2.00 deal</p>
  <p>Questions? <a href="tel:+15550142">Call us</a> or <a href="mailto:hello@harborvine.example?subject=Hi">email</a>.</p>
  <p>Open Mon–Sun 11:00 – 23:00</p>
</main></body></html>`;

describe("extractHtml", () => {
  const r = extractHtml(PAGE, { assetName: "Menu page" });
  const find = (entity: string, attr: string) => r.facts.filter((f) => f.entityName === entity && f.attributeName === attr);

  it("reads title, description, language and headings", () => {
    expect(r.title).toBe("Harbor & Vine — Menu");
    expect(r.description).toBe("Seasonal menu for our three locations.");
    expect(r.lang).toBe("en");
    expect(r.headings).toEqual([{ level: 1, text: "Our menu" }]);
    expect(find("Harbor & Vine — Menu", "page title")[0]?.confidence).toBe(0.95);
  });

  it("extracts schema.org JSON-LD with high confidence", () => {
    expect(find("Classic Burger", "price").map((f) => [f.normalizedValue, f.method])).toContainEqual(["USD 15.00", "json_ld"]);
    expect(find("Classic Burger", "availability")[0]?.valueText).toBe("InStock");
    expect(find("Harbor & Vine Downtown", "phone")[0]?.normalizedValue).toBe("+15550142");
    expect(find("Harbor & Vine Downtown", "address")[0]?.valueText).toBe("1 Pier St, Harbor City");
    expect(find("Harbor & Vine Downtown", "opening hours")[0]?.valueText).toBe("Monday, Tuesday 11:00-23:00");
    expect(r.warnings).toContain("Structured data block 2 is not valid JSON and was skipped.");
  });

  it("extracts microdata and visible price lines with element paths", () => {
    expect(find("Truffle Fries", "price")[0]).toMatchObject({ normalizedValue: "USD 8.50", confidence: 0.9 });
    const risotto = find("Pumpkin Risotto", "price")[0];
    expect(risotto?.normalizedValue).toBe("USD 19.00");
    expect(risotto?.location.path).toMatch(/li/);
  });

  it("reads tel: and mailto: links", () => {
    expect(r.facts.some((f) => f.attributeName === "phone" && f.method === "html" && f.confidence === 0.9)).toBe(true);
    expect(r.facts.find((f) => f.attributeName === "email")?.valueText).toBe("hello@harborvine.example");
  });

  it("ignores scripts, styles and hidden content", () => {
    const all = JSON.stringify(r);
    expect(all).not.toContain("Secret");
    expect(all).not.toContain("Lobster");
    expect(all).not.toContain("Invisible");
    expect(all).not.toContain("$1.00");
    expect(r.text).toContain("Classic Burger");
  });

  it("deduplicates the same fact found in several places", () => {
    const burger = find("Classic Burger", "price");
    expect(burger).toHaveLength(1);
    expect(burger[0]!.method).toBe("json_ld"); // highest confidence wins
  });

  it("warns when a page has no visible text (JavaScript-rendered)", () => {
    const empty = extractHtml("<html><body><div id=root></div><script>render()</script></body></html>", { assetName: "SPA" });
    expect(empty.text).toBe("");
    expect(empty.warnings.join(" ")).toMatch(/rendered by JavaScript/);
  });
});
