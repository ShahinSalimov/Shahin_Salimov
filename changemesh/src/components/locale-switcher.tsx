import { LOCALE_LABELS, LOCALES, type Locale } from "@/i18n/config";
import { setLocaleAction } from "@/server/i18n/actions";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ current }: { current: Locale }) {
  return (
    <form action={setLocaleAction} className="flex items-center gap-1 text-xs" aria-label="Language">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="submit"
          name="locale"
          value={locale}
          aria-pressed={locale === current}
          className={cn(
            "rounded px-2 py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2",
            locale === current && "bg-muted font-medium text-foreground",
          )}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </form>
  );
}
