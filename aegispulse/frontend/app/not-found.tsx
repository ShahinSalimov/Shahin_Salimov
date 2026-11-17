import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="font-mono text-sm text-slate-500">404</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-100">Page not found</h1>
        <Link href="/" className="mt-3 inline-block text-sm text-cyan-300 underline">
          Back to the command center
        </Link>
      </div>
    </div>
  );
}
