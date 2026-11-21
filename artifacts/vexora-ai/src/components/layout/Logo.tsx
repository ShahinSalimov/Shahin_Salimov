export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="group flex items-center gap-2.5 cursor-pointer" aria-label="Salimofff Aİ — ana səhifə">
      <span className="relative grid size-9 place-items-center rounded-xl bg-blaze-500 font-display text-lg font-extrabold text-cream rotate-[-6deg] transition-transform group-hover:rotate-0">
        S
        <span className="absolute -right-1 -top-1 size-3 rounded-full bg-volt-500 ring-2 ring-ink-900" />
      </span>
      <span className="whitespace-nowrap font-display text-lg font-extrabold tracking-tight">
        Salimofff <span className="font-sans font-extrabold text-volt-400">Aİ</span>
      </span>
    </button>
  );
}
