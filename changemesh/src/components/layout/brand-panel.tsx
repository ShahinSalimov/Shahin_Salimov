/** Decorative product illustration for auth pages: one change fanning out to connected assets. */
export function BrandPanel({ tagline }: { tagline: string }) {
  const nodes = [
    { x: 300, y: 70, label: "Website menu", sub: "$12.00 → $15.00" },
    { x: 330, y: 160, label: "Dinner menu.pdf", sub: "page 2" },
    { x: 300, y: 250, label: "Online ordering", sub: "critical" },
    { x: 220, y: 320, label: "Campaign deck", sub: "2 hops" },
  ];
  return (
    <div className="relative hidden overflow-hidden bg-[oklch(0.2_0.03_272)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_50%_at_70%_20%,oklch(0.55_0.2_272/0.55),transparent),radial-gradient(40%_40%_at_10%_90%,oklch(0.6_0.15_200/0.35),transparent)]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]" aria-hidden="true" />
      <p className="relative text-xs font-medium tracking-[0.25em] text-white/60 uppercase">Business change management</p>
      <svg viewBox="0 0 480 380" className="relative mx-auto w-full max-w-md" aria-hidden="true">
        {nodes.map((n) => (
          <path key={n.label} d={`M166 190 C 220 190, ${n.x - 90} ${n.y}, ${n.x - 6} ${n.y}`} fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 4" />
        ))}
        <g>
          <rect x="16" y="150" width="150" height="80" rx="14" fill="white" fillOpacity="0.12" stroke="white" strokeOpacity="0.35" />
          <text x="32" y="180" fill="white" fillOpacity="0.65" fontSize="11">Price list · v4</text>
          <text x="32" y="204" fill="white" fontSize="15" fontWeight="600">Classic Burger</text>
          <text x="32" y="221" fill="#c7c9ff" fontSize="12">$12.00 → $15.00</text>
        </g>
        {nodes.map((n) => (
          <g key={`${n.label}-box`}>
            <rect x={n.x - 6} y={n.y - 22} width="150" height="44" rx="10" fill="white" fillOpacity="0.1" stroke="white" strokeOpacity="0.28" />
            <circle cx={n.x + 10} cy={n.y} r="4" fill={n.sub === "critical" ? "#ff8a7a" : "#a5b4fc"} />
            <text x={n.x + 22} y={n.y - 3} fill="white" fontSize="12" fontWeight="500">
              {n.label}
            </text>
            <text x={n.x + 22} y={n.y + 12} fill="white" fillOpacity="0.55" fontSize="10">
              {n.sub}
            </text>
          </g>
        ))}
      </svg>
      <div className="relative">
        <p className="text-2xl leading-snug font-semibold text-balance">{tagline}</p>
        <ul className="mt-5 grid gap-2 text-sm text-white/70">
          <li>• See every asset that carries the same information</li>
          <li>• Understand the impact before anything changes</li>
          <li>• Nothing is published without explicit approval</li>
        </ul>
      </div>
    </div>
  );
}
