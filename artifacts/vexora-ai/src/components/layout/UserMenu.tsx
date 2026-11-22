import { useEffect, useRef, useState } from 'react';
import { LogOut, User, Wallet } from 'lucide-react';
import { useApp } from '@/store/AppStore';
import { useI18n } from '@/i18n';

export function UserMenu() {
  const { me, navigate, signOut } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!me) return null;
  const go = (r: Parameters<typeof navigate>[0]) => { setOpen(false); navigate(r); };
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-sm text-fg-muted hover:bg-surface-2 hover:text-fg cursor-pointer';

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('account.menu')}
        className="grid size-9 place-items-center rounded-full bg-primary-soft font-display text-sm font-bold text-primary-strong ring-1 ring-primary/25 hover:ring-primary cursor-pointer">
        {(me.name || me.email).charAt(0).toUpperCase()}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-11 z-50 w-60 rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-line animate-rise">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{me.name}</p>
            <p className="truncate text-xs text-fg-subtle">{me.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" className={item} onClick={() => go('profile')}><User size={16} /> {t('nav.profile')}</button>
          {me.role === 'admin' && <button role="menuitem" className={item} onClick={() => go('admin')}><Wallet size={16} /> {t('account.admin')}</button>}
          <button role="menuitem" className={item} onClick={() => { setOpen(false); void signOut(); }}><LogOut size={16} /> {t('account.signOut')}</button>
        </div>
      )}
    </div>
  );
}
