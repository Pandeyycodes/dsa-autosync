import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

export function TextInput({
  error,
  prefix,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & { error?: string | null; prefix?: ReactNode }) {
  return (
    <div className="w-full">
      <div
        className={cn(
          'flex h-8 items-center gap-2 rounded-md border bg-canvas px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:shadow-focus',
          error ? 'border-danger/60' : 'border-line-strong hover:border-[#36363e] focus-within:border-[#45454e]',
          rest.disabled && 'opacity-50',
          className,
        )}
      >
        {prefix && <span className="flex shrink-0 text-fg-subtle">{prefix}</span>}
        <input
          {...rest}
          aria-invalid={!!error}
          className="h-full w-full min-w-0 bg-transparent font-mono text-sm text-fg placeholder:text-fg-faint focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** A labelled settings row: title + description on the left, control on the right. */
export function SettingRow({
  title,
  description,
  children,
  icon,
  htmlFor,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-[1px]">{icon}</div>}
        <div className="min-w-0">
          <label htmlFor={htmlFor} className="block text-base font-medium text-fg">{title}</label>
          {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsCard({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="card animate-fade-up overflow-hidden" aria-label={title}>
      <header className="border-b border-line px-5 py-3.5">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
      </header>
      <div className="divide-y divide-line">{children}</div>
      {footer && <footer className="border-t border-line bg-surface-raised/40 px-5 py-3">{footer}</footer>}
    </section>
  );
}
