import { cn } from '../lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/** Accessible toggle (role="switch"). `label` is used as the accessible name. */
export function Switch({ checked, onChange, label, disabled, size = 'md' }: SwitchProps) {
  const dims = size === 'sm' ? 'h-[16px] w-[28px]' : 'h-[18px] w-[32px]';
  const knob = size === 'sm' ? 'h-3 w-3' : 'h-[14px] w-[14px]';
  const travel = size === 'sm' ? 'translate-x-[12px]' : 'translate-x-[14px]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'focus-ring relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40',
        dims,
        checked ? 'border-accent-muted bg-accent' : 'border-line-strong bg-surface-active hover:bg-[#24242a]',
      )}
    >
      <span
        className={cn(
          'pointer-events-none ml-[1px] inline-block rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
          knob,
          checked ? cn(travel, 'bg-canvas') : 'translate-x-0 bg-fg-muted',
        )}
      />
    </button>
  );
}
