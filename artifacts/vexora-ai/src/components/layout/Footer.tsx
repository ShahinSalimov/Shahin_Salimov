export function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-700/60 pb-24 md:pb-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} Salimofff Aİ. Bütün hüquqlar qorunur.</p>
        <p className="font-mono text-xs text-ink-400">Önizləmələr prosedur yolla yaradılmış sintetik vizuallardır.</p>
      </div>
    </footer>
  );
}
