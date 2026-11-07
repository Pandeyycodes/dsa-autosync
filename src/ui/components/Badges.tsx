import { Ban, Check, CircleDashed, Clock, CopyMinus, Loader2, PauseCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { PLATFORMS } from '@/shared/constants';
import type { Job, PlatformId } from '@/shared/types';
import { cn } from '../lib/utils';

export function Badge({ children, className, tone = 'neutral' }: { children: ReactNode; className?: string; tone?: 'neutral' | 'accent' | 'warn' | 'danger' }) {
  const tones = {
    neutral: 'border-line-strong bg-surface-raised text-fg-muted',
    accent: 'border-accent/20 bg-accent-soft text-accent',
    warn: 'border-warn/20 bg-warn-soft text-warn',
    danger: 'border-danger/20 bg-danger-soft text-danger',
  };
  return (
    <span className={cn('inline-flex h-[18px] items-center gap-1 rounded-[5px] border px-1.5 text-2xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

const platformTint: Record<PlatformId, string> = {
  leetcode: 'text-leetcode bg-leetcode/10 border-leetcode/20',
  gfg: 'text-gfg bg-gfg/10 border-gfg/20',
};

/** Monogram tile for a platform (we avoid reproducing third-party logos). */
export function PlatformMark({ platform, size = 'md', muted }: { platform: PlatformId; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  const dims = { sm: 'h-5 w-5 text-[8.5px] rounded-[5px]', md: 'h-7 w-7 text-[10px] rounded-md', lg: 'h-9 w-9 text-[11.5px] rounded-lg' }[size];
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center border font-mono font-semibold tracking-tight transition-opacity', dims, platformTint[platform], muted && 'opacity-40 grayscale')}
    >
      {PLATFORMS[platform].shortName}
    </span>
  );
}

const DIFF: Record<string, string> = { easy: 'bg-[#3DD68C]', basic: 'bg-[#3DD68C]', school: 'bg-[#3DD68C]', medium: 'bg-[#F2B54B]', hard: 'bg-[#F26B6B]' };

export function DifficultyLabel({ difficulty }: { difficulty: string | null }) {
  if (!difficulty) return <span className="text-xs text-fg-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <span className={cn('h-1.5 w-1.5 rounded-full', DIFF[difficulty.toLowerCase()] ?? 'bg-fg-faint')} aria-hidden="true" />
      {difficulty}
    </span>
  );
}

type JobDisplay = { label: string; icon: ReactNode; className: string };

export function jobDisplay(job: Job): JobDisplay {
  switch (job.status) {
    case 'uploaded':
      return job.outcome === 'unchanged' || job.outcome === 'duplicate'
        ? { label: 'Unchanged', icon: <CopyMinus size={12} strokeWidth={2.25} />, className: 'text-fg-subtle' }
        : job.outcome === 'skipped_exists'
          ? { label: 'Kept existing', icon: <CopyMinus size={12} strokeWidth={2.25} />, className: 'text-fg-subtle' }
          : { label: job.outcome === 'updated' ? 'Updated' : 'Uploaded', icon: <Check size={12} strokeWidth={2.5} />, className: 'text-accent' };
    case 'verifying':
      return { label: 'Verifying', icon: <CircleDashed size={12} strokeWidth={2.25} className="animate-spin [animation-duration:2.5s]" />, className: 'text-warn' };
    case 'queued':
      return job.attempts > 0
        ? { label: `Retrying (${job.attempts})`, icon: <Clock size={12} strokeWidth={2.25} />, className: 'text-warn' }
        : { label: 'Queued', icon: <Clock size={12} strokeWidth={2.25} />, className: 'text-warn' };
    case 'uploading':
      return { label: 'Uploading', icon: <Loader2 size={12} strokeWidth={2.25} className="animate-spin" />, className: 'text-warn' };
    case 'held':
      return { label: 'Held', icon: <PauseCircle size={12} strokeWidth={2.25} />, className: 'text-fg-muted' };
    case 'ignored':
      return { label: 'Ignored', icon: <Ban size={12} strokeWidth={2.25} />, className: 'text-fg-subtle' };
    case 'failed':
      return { label: 'Failed', icon: <TriangleAlert size={12} strokeWidth={2.25} />, className: 'text-danger' };
  }
}

export function JobStatusLabel({ job, compact }: { job: Job; compact?: boolean }) {
  const d = jobDisplay(job);
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium', d.className)} title={job.error?.message ?? d.label}>
      {d.icon}
      {compact ? <span className="sr-only">{d.label}</span> : d.label}
    </span>
  );
}

export function StatusDot({ tone }: { tone: 'idle' | 'ok' | 'warn' }) {
  const color = { idle: 'bg-fg-faint', ok: 'bg-accent', warn: 'bg-warn' }[tone];
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden="true">
      {tone === 'ok' && <span className="absolute inset-0 animate-breathe rounded-full bg-accent/50 blur-[3px]" />}
      <span className={cn('relative h-2 w-2 rounded-full', color)} />
    </span>
  );
}
