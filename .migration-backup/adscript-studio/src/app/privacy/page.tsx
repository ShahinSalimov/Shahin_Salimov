export const metadata = { title: "Privacy Policy · AdScript Studio" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-5 py-10 text-sm leading-relaxed text-muted">
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <p>Last updated: [DATE]. Replace bracketed placeholders before launch.</p>
      <p><b className="text-white">What we collect.</b> Your email address (for sign-in), the product details and photos you submit, the ad packs we generate for you, and your credit purchases (license key and sale ID from Gumroad).</p>
      <p><b className="text-white">How we use it.</b> Only to provide the service: generate your ads, keep your history, and track your credits. We do not sell your data.</p>
      <p><b className="text-white">Processors.</b> Supabase (authentication and database), Anthropic (AI text generation; your product details and photo are sent to generate the ad), Gumroad (payments), and our hosting provider.</p>
      <p><b className="text-white">Retention and deletion.</b> Email [SUPPORT EMAIL] to delete your account and all its data.</p>
      <p><b className="text-white">Contact.</b> [SUPPORT EMAIL]</p>
    </main>
  );
}
