/**
 * Simplified acceptance marks. Before launch, swap in the official artwork your acquirer
 * provides (Visa and Mastercard publish acceptance-mark files and usage rules).
 */
export function VisaMark({ className = 'h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} role="img" aria-label="Visa">
      <rect width="64" height="40" rx="6" fill="#fff" stroke="var(--color-line)" />
      <text x="32" y="26.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="17" fontStyle="italic" fontWeight="900" fill="#1a1f71" letterSpacing="-0.5">VISA</text>
    </svg>
  );
}

export function MastercardMark({ className = 'h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} role="img" aria-label="Mastercard">
      <rect width="64" height="40" rx="6" fill="#fff" stroke="var(--color-line)" />
      <circle cx="26" cy="20" r="11" fill="#eb001b" />
      <circle cx="38" cy="20" r="11" fill="#f79e1b" />
      <path d="M32 10.8a11 11 0 0 1 0 18.4 11 11 0 0 1 0-18.4z" fill="#ff5f00" />
    </svg>
  );
}

export function CardBrands({ className }: { className?: string }) {
  return <div className={`flex items-center gap-2 ${className ?? ''}`}><VisaMark /><MastercardMark /></div>;
}
