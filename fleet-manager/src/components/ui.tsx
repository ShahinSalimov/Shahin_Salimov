import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { X, Search } from 'lucide-react';
import { cls } from '../lib/format';

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cls('rounded-2xl border border-slate-200 bg-white shadow-sm', onClick && 'cursor-pointer transition hover:border-slate-300 hover:shadow', className)}>
      {children}
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost' | 'success' | 'dark';
const btnStyles: Record<BtnVariant, string> = {
  primary: 'bg-brand-400 text-ink hover:bg-brand-300 font-semibold',
  dark: 'bg-ink text-white hover:bg-slate-800',
  secondary: 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
  dangerGhost: 'text-rose-600 hover:bg-rose-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500',
};

export function Button({ variant = 'secondary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...p}
      className={cls(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-xs' : size === 'lg' ? 'h-12 px-5 text-base' : 'h-10 px-4 text-sm',
        btnStyles[variant],
        className,
      )}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-[15px] outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-300/50 md:h-10 md:text-sm';

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cls(inputCls, !/\bw-/.test(p.className ?? '') && 'w-full', p.className)} />;
}

export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cls(inputCls, 'pr-8', !/\bw-/.test(p.className ?? '') && 'w-full', p.className)}>
      {children}
    </select>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Axtar...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full md:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 anim-fade md:items-center md:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cls('anim-sheet flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl md:rounded-2xl', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Bağla">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex gap-2 border-t border-slate-100 px-5 py-3 [&>*]:flex-1 md:[&>*]:flex-none md:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

type Tone = 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'gold' | 'violet';
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  gold: 'bg-brand-100 text-yellow-800 ring-yellow-600/30',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cls('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent', tones[tone])}>{children}</span>;
}

export function Stat({ label, value, sub, icon, tone = 'slate', onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'brand'; onClick?: () => void }) {
  const iconTone = { slate: 'bg-slate-100 text-slate-600', green: 'bg-emerald-100 text-emerald-700', red: 'bg-rose-100 text-rose-700', amber: 'bg-amber-100 text-amber-700', brand: 'bg-brand-100 text-yellow-700' }[tone];
  return (
    <Card className="p-4" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="tabular mt-1 text-lg font-bold leading-tight tracking-tight sm:text-xl md:text-2xl">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
        </div>
        {icon && <div className={cls('hidden size-9 shrink-0 place-items-center rounded-xl sm:grid', iconTone)}>{icon}</div>}
      </div>
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center text-sm text-slate-400">{text}</div>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="scroll-x -mx-4 mb-4 flex gap-1.5 px-4 md:mx-0 md:px-0">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={cls('whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition', value === i.value ? 'bg-ink text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}
        >
          {i.label}
          {i.count !== undefined && <span className={cls('ml-1.5 tabular text-xs', value === i.value ? 'text-slate-300' : 'text-slate-400')}>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Masaüstündə cədvəl, telefonda kart siyahısı. */
export function DataList<T>({ rows, columns, mobile, onRow, empty = 'Məlumat yoxdur', limit }: {
  rows: T[];
  columns: { head: string; cell: (r: T) => ReactNode; className?: string }[];
  mobile: (r: T) => ReactNode;
  onRow?: (r: T) => void;
  empty?: string;
  limit?: number;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (!rows.length) return <Card><Empty text={empty} /></Card>;
  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                {columns.map((c) => (
                  <th key={c.head} className={cls('px-4 py-3 font-medium', c.className)}>{c.head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} onClick={() => onRow?.(r)} className={cls('border-b border-slate-50 last:border-0', onRow && 'cursor-pointer hover:bg-slate-50')}>
                  {columns.map((c) => (
                    <td key={c.head} className={cls('px-4 py-3', c.className)}>{c.cell(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="space-y-2 md:hidden">
        {shown.map((r, i) => (
          <Card key={i} className="p-3.5" onClick={onRow ? () => onRow(r) : undefined}>{mobile(r)}</Card>
        ))}
      </div>
      {limit && rows.length > limit && <div className="mt-3 text-center text-xs text-slate-400">{rows.length - limit} sətir daha var — axtarışla daraldın</div>}
    </>
  );
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'fixed left-1/2 bottom-24 md:bottom-8 z-[60] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-xl transition-opacity';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el && (el.style.opacity = '0'), 2200);
}

/**
 * Tətbiqin öz təsdiq/daxiletmə pəncərəsi (brauzerin confirm/prompt əvəzinə —
 * bəzi mühitlərdə, məs. iframe-də, onlar işləmir).
 */
function dialog(message: string, withInput?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-0 anim-fade md:items-center md:p-6';
    wrap.innerHTML = `
      <div class="anim-sheet w-full rounded-t-3xl bg-white p-5 shadow-2xl md:max-w-sm md:rounded-2xl">
        <p class="text-[15px] font-medium leading-relaxed text-slate-800"></p>
        ${withInput !== undefined ? '<input class="mt-3 h-11 w-full rounded-xl border border-slate-300 px-3 text-[15px] outline-none focus:border-yellow-500" inputmode="decimal" />' : ''}
        <div class="safe-bottom mt-5 flex gap-2">
          <button data-no class="h-11 flex-1 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700">Ləğv</button>
          <button data-yes class="h-11 flex-1 rounded-xl bg-yellow-400 text-sm font-semibold text-slate-900">Təsdiq</button>
        </div>
      </div>`;
    wrap.querySelector('p')!.textContent = message;
    const input = wrap.querySelector('input');
    if (input) input.value = withInput ?? '';
    const done = (v: string | null) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null); }
      if (e.key === 'Enter') done(input ? input.value : 'ok');
    };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', (e) => e.target === wrap && done(null));
    wrap.querySelector('[data-no]')!.addEventListener('click', () => done(null));
    wrap.querySelector('[data-yes]')!.addEventListener('click', () => done(input ? input.value : 'ok'));
    document.body.appendChild(wrap);
    (input ?? (wrap.querySelector('[data-yes]') as HTMLElement)).focus();
  });
}

export const ask = async (message: string) => (await dialog(message)) !== null;
export const askValue = (message: string, def = '') => dialog(message, def);

/** iframe daxilində (məs. demo linkdə) çap işləmir — düyməni gizlətmək üçün */
export const canPrint = typeof window !== 'undefined' && window.self === window.top;
