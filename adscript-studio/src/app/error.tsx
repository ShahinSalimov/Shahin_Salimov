"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-muted">Please try again. If it keeps happening, contact support.</p>
      <button onClick={reset} className="btn-primary mt-8">Try again</button>
    </main>
  );
}
