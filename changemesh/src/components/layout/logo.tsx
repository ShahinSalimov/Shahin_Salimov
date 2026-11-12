import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight" aria-label="CHANGEMESH home">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <g className="stroke-primary-foreground" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M10 11 L22 11 M10 11 L16 21 M22 11 L16 21" opacity="0.55" />
        </g>
        <g className="fill-primary-foreground">
          <circle cx="10" cy="11" r="3" />
          <circle cx="22" cy="11" r="3" />
          <circle cx="16" cy="21" r="3" />
        </g>
      </svg>
      <span className="text-[15px] tracking-[0.08em]">CHANGEMESH</span>
    </Link>
  );
}
