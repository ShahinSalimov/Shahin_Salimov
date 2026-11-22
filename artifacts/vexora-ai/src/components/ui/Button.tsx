import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'accent' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-sm',
  accent: 'bg-accent text-on-accent hover:bg-accent-hover shadow-sm',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-2',
  outline: 'border border-line-strong bg-surface text-fg hover:border-primary hover:text-primary-strong',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'primary', size = 'md', className, ...rest }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-[.97] disabled:pointer-events-none disabled:opacity-40 cursor-pointer',
      variants[variant], sizes[size], className,
    )}
    {...rest}
  />
));
Button.displayName = 'Button';
