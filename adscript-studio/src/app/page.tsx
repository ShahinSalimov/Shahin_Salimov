import Link from "next/link";
import { getCreditPacks } from "@/lib/config";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", title: "Describe your product", text: "Name, a few lines about it, and an optional product photo." },
  { n: "2", title: "Pick platform & style", text: "TikTok, Reels or Shorts. 15-60 s. UGC, cinematic, problem-solution and more." },
  { n: "3", title: "Get your ad pack", text: "3 hooks, a second-by-second script, AI image & video prompts, caption and hashtags." },
];

const INCLUDED = [
  "3 scroll-stopping hook variations",
  "Second-by-second scene script with camera directions",
  "On-screen text and voiceover for every scene",
  "Copy-paste AI image prompt per scene",
  "Copy-paste AI video (image-to-video) prompt per scene",
  "Caption, CTA and 8-15 hashtags",
  "Music mood suggestion",
];

export default function Home() {
  let packs: ReturnType<typeof getCreditPacks> = [];
  try {
    packs = getCreditPacks();
  } catch (error) {
    console.error("Invalid GUMROAD_PRODUCTS config", error);
    packs = [];
  }

  return (
    <main className="mx-auto max-w-6xl px-5">
      <section className="py-16 text-center sm:py-24">
        <p className="mb-4 inline-block rounded-full border border-line px-4 py-1 text-sm text-muted">
          For e-commerce brands, dropshippers & UGC creators
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Your next <span className="text-brand">TikTok & Reels ad</span>, scripted in 30 seconds
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Drop in a product. Get hooks, a second-by-second script and ready-to-use prompts for AI image and video
          generators. Pay per ad, no subscription.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="btn-primary">Try it free: 3 ad packs</Link>
          <a href="#pricing" className="btn-ghost">See pricing</a>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="card p-6">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 font-bold text-brand">{s.n}</div>
            <h3 className="font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-muted">{s.text}</p>
          </div>
        ))}
      </section>

      <section className="mt-20 grid items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">Everything you need to shoot or generate the ad</h2>
          <p className="mt-4 text-muted">
            Every ad pack is built around your real product. Prompts keep the product looking the same in every scene,
            and nothing is made up: no fake reviews, prices or claims.
          </p>
        </div>
        <ul className="card space-y-3 p-6">
          {INCLUDED.map((i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="text-brand">✓</span>
              {i}
            </li>
          ))}
        </ul>
      </section>

      <section id="pricing" className="mt-20 scroll-mt-10">
        <h2 className="text-center text-3xl font-bold">Simple credit packs</h2>
        <p className="mt-3 text-center text-muted">1 credit = 1 complete ad pack. Credits never expire.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {packs.length === 0 && <p className="text-center text-muted sm:col-span-3">Pricing coming soon.</p>}
          {packs.map((p, i) => (
            <div key={p.productId} className={`card flex flex-col p-6 ${i === 1 ? "border-brand" : ""}`}>
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2 text-4xl font-extrabold">{p.price}</p>
              <p className="mt-1 text-sm text-muted">{p.credits} ad packs</p>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn-primary mt-6">
                Buy {p.name}
              </a>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          After checkout you receive a license key by email. Paste it into the app to add your credits.
        </p>
      </section>
    </main>
  );
}
