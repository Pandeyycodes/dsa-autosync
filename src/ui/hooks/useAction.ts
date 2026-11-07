import { useCallback, useState } from 'react';
import type { UiMessage } from '@/shared/messages';
import { useToast } from '../components/Toast';
import { useSettings } from './useSettings';

/** Run a service-worker action with pending state and error toasts. */
export function useAction() {
  const { send } = useSettings();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(msg: UiMessage, opts: { success?: string } = {}): Promise<T | null> => {
      setPending(msg.type);
      try {
        const res = await send<T>(msg);
        if (!res.ok) {
          toast(res.error.message);
          return null;
        }
        if (opts.success) toast(opts.success);
        return res.data;
      } finally {
        setPending(null);
      }
    },
    [send, toast],
  );
  return { run, pending };
}
