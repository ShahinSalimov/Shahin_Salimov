"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-200">The command center hit an unexpected error</h1>
        <p className="mt-2 font-mono text-xs text-red-200/70">{error.digest ?? error.message}</p>
        <button type="button" onClick={reset} className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
          Reload dashboard
        </button>
      </div>
    </div>
  );
}
