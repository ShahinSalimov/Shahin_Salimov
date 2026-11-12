"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 20 }}>CHANGEMESH is temporarily unavailable</h1>
          <p style={{ color: "#666" }}>{error.digest ? `Reference: ${error.digest}` : "Please try again."}</p>
          <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
