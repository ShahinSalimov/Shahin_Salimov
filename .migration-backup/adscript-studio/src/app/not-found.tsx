import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary mt-8">Back home</Link>
    </main>
  );
}
