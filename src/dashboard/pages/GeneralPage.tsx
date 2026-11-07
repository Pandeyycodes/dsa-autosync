import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DUPLICATE_STRATEGIES } from '@/shared/constants';
import { Button } from '@/ui/components/Button';
import { SettingRow, SettingsCard } from '@/ui/components/Fields';
import { Switch } from '@/ui/components/Switch';
import { useToast } from '@/ui/components/Toast';
import { useAction } from '@/ui/hooks/useAction';
import { useSettings } from '@/ui/hooks/useSettings';
import { cn } from '@/ui/lib/utils';

export function GeneralPage() {
  const { settings, update, reset, account } = useSettings();
  const { run } = useAction();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setReadme = (k: keyof typeof settings.readme, v: boolean) => update((s) => ({ ...s, readme: { ...s.readme, [k]: v } }));
  const setNotify = (k: keyof typeof settings.notifications, v: boolean) => update((s) => ({ ...s, notifications: { ...s.notifications, [k]: v } }));

  return (
    <div className="space-y-4">
      <SettingsCard title="Synchronization">
        <SettingRow title="Automatic sync" description="Upload accepted solutions as soon as the verdict is confirmed. When off, they are held for manual sync.">
          <Switch label="Automatic sync" checked={settings.autoSync} onChange={(v) => update({ autoSync: v })} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Duplicate handling" description="What happens when a solution file already exists with different code. Identical code is never re-committed.">
        <div role="radiogroup" aria-label="Duplicate handling" className="grid grid-cols-1 gap-2 p-4 md:grid-cols-3">
          {DUPLICATE_STRATEGIES.map((opt) => {
            const selected = settings.duplicateStrategy === opt.id;
            return (
              <button key={opt.id} type="button" role="radio" aria-checked={selected} onClick={() => update({ duplicateStrategy: opt.id })}
                className={cn('focus-ring rounded-lg border p-3 text-left transition-[border-color,background-color] duration-150', selected ? 'border-[#4a4a54] bg-surface-active' : 'border-line hover:border-line-strong hover:bg-surface-hover')}>
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-full border', selected ? 'border-fg' : 'border-line-strong')}>
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-fg" />}
                  </span>
                  <span className="text-sm font-medium text-fg">{opt.label}</span>
                </div>
                <p className="mt-1.5 pl-[22px] text-xs text-fg-subtle">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="README content" description="Metadata, link and solution list are always included. Problem text belongs to the platform — include it only where you are permitted to redistribute it (e.g. a private repository).">
        <SettingRow title="Problem statement" description="Copy the statement verbatim from the platform.">
          <Switch label="Include problem statement" checked={settings.readme.includeStatement} onChange={(v) => setReadme('includeStatement', v)} />
        </SettingRow>
        <SettingRow title="Examples" description="Include the platform's examples.">
          <Switch label="Include examples" checked={settings.readme.includeExamples} onChange={(v) => setReadme('includeExamples', v)} />
        </SettingRow>
        <SettingRow title="Constraints" description="Include the platform's constraints list.">
          <Switch label="Include constraints" checked={settings.readme.includeConstraints} onChange={(v) => setReadme('includeConstraints', v)} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Notifications">
        <SettingRow title="Successful uploads" description="Show a desktop notification when a new or updated solution is committed.">
          <Switch label="Notify on success" checked={settings.notifications.onSuccess} onChange={(v) => setNotify('onSuccess', v)} />
        </SettingRow>
        <SettingRow title="Failures" description="Notify when an upload fails permanently.">
          <Switch label="Notify on failure" checked={settings.notifications.onFailure} onChange={(v) => setNotify('onFailure', v)} />
        </SettingRow>
      </SettingsCard>

      {account && (
        <SettingsCard title="Data" description="Revokes CodeSync's GitHub authorization and erases all local history. The CodeSync server stores nothing about you. Files already committed to your repository are not touched.">
          <div className="flex items-center justify-end gap-2 px-5 py-3">
            {confirmDelete ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button size="sm" variant="secondary" className="border-danger/40 text-danger" icon={<Trash2 size={12} />} onClick={() => run({ type: 'ui/delete-account' }, { success: 'CodeSync account deleted' })}>
                  Permanently delete
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setConfirmDelete(true)}>Delete account data</Button>
            )}
          </div>
        </SettingsCard>
      )}

      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-xs text-fg-subtle">Preferences are saved automatically on this device.</p>
        <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={() => { reset(); toast('Settings restored', 'All preferences are back to their defaults.'); }}>
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
