import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-fg text-canvas shadow-button hover:bg-white active:bg-[#d9d9de]',
  secondary:
    'border border-line-strong bg-surface-raised text-fg hover:bg-surface-hover hover:border-[#36363e] active:bg-surface-active',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-hover active:bg-surface-active',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-sm gap-2 rounded-md',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, trailing, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'focus-ring inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {trailing}
    </button>
  );
});

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-150 hover:bg-surface-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
