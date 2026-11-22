import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n';

interface Props { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }

export function Modal({ open, onClose, title, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-overlay/45 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn('relative w-full max-h-[92vh] overflow-auto rounded-t-3xl sm:rounded-3xl bg-surface ring-1 ring-line animate-rise outline-none', className)}
      >
        <button onClick={onClose} aria-label={t('common.close')} className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-surface/90 shadow-sm text-fg hover:text-primary-strong cursor-pointer">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
