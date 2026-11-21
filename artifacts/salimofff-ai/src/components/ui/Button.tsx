import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'volt' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-blaze-500 text-cream hover:bg-blaze-400 shadow-[0_8px_30px_-8px_rgb(255_42_60/.7)]',
  volt: 'bg-volt-500 text-ink-900 hover:bg-volt-400 shadow-[0_8px_30px_-10px_rgb(255_194_26/.7)]',
  ghost: 'text-cream/80 hover:text-cream hover:bg-ink-700/70',
  outline: 'border border-ink-600 text-cream hover:border-volt-500 hover:text-volt-300',
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
