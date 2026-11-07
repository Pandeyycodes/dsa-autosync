import { Database } from 'lucide-react';
import { PLATFORM_IDS, PLATFORMS } from '@/shared/constants';
import { LANGUAGE_IDS, LANGUAGES } from '@/shared/languages';
import { PlatformMark } from '@/ui/components/Badges';
import { SettingRow, SettingsCard } from '@/ui/components/Fields';
import { Switch } from '@/ui/components/Switch';
import { useSettings } from '@/ui/hooks/useSettings';
import { cn } from '@/ui/lib/utils';

const DESCRIPTIONS = {
  leetcode: 'Detect accepted submissions on leetcode.com problem pages.',
  gfg: 'Detect accepted submissions on geeksforgeeks.org practice problems.',
} as const;

export function PlatformsPage() {
  const { settings, update } = useSettings();
  return (
    <div className="space-y-4">
      <SettingsCard title="Coding platforms" description="CodeSync only observes platforms you enable.">
        {PLATFORM_IDS.map((id) => (
          <SettingRow key={id} title={PLATFORMS[id].name} description={DESCRIPTIONS[id]} icon={<PlatformMark platform={id} muted={!settings.platforms[id]} />}>
            <Switch label={`Enable ${PLATFORMS[id].name}`} checked={settings.platforms[id]} onChange={(v) => update((s) => ({ ...s, platforms: { ...s.platforms, [id]: v } }))} />
          </SettingRow>
        ))}
      </SettingsCard>

      <SettingsCard title="SQL" description="SQL is a language, not a platform: database problems from either platform are stored as .sql files.">
        <SettingRow
          title="SQL support"
          description="Sync MySQL, PostgreSQL, MS SQL Server and Oracle solutions."
          icon={<span className="flex h-7 w-7 items-center justify-center rounded-md border border-line-strong bg-surface-raised text-fg-muted"><Database size={13} /></span>}
        >
          <Switch label="SQL support" checked={settings.sqlSupport} onChange={(v) => update({ sqlSupport: v })} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Languages" description="Accepted solutions in turned-off languages are recorded as ignored and never uploaded.">
        <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-3 lg:grid-cols-4" role="group" aria-label="Languages">
          {LANGUAGE_IDS.filter((l) => l !== 'sql').map((id) => {
            const on = settings.languages[id];
            return (
              <label key={id} className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors', on ? 'border-line-strong bg-surface-raised' : 'border-line hover:border-line-strong')}>
                <span className={cn('font-mono text-sm', on ? 'text-fg' : 'text-fg-subtle')}>{LANGUAGES[id].label}</span>
                <Switch size="sm" label={`Sync ${LANGUAGES[id].label}`} checked={on} onChange={(v) => update((s) => ({ ...s, languages: { ...s.languages, [id]: v } }))} />
              </label>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
}
