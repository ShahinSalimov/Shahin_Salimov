import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const HUES = [272, 200, 160, 30, 330, 100];

export function Avatar({ name, id, className }: { name: string | null; id: string; className?: string }) {
  const hue = HUES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold", className)}
      style={{ background: `oklch(0.9 0.05 ${hue} / 0.9)`, color: `oklch(0.35 0.1 ${hue})` }}
    >
      {initials(name)}
    </span>
  );
}
