import { cn } from '../lib/utils';

/** CodeSync mark: code chevrons with a sync node. Mirrors scripts/generate-icons.mjs. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn('shrink-0', className)} aria-hidden="true">
      <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" fill="#18181B" stroke="#34343B" />
      <path
        d="M9 7.5 4.75 12 9 16.5M15 7.5 19.25 12 15 16.5"
        fill="none"
        stroke="#ECECEE"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.6" fill="#3DD68C" />
    </svg>
  );
}

export function Wordmark({ size = 24, sub }: { size?: number; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="flex flex-col leading-none">
        <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg">CodeSync</span>
        {sub && <span className="mt-1 text-2xs text-fg-subtle">{sub}</span>}
      </div>
    </div>
  );
}
