import { Info } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
}

const ToastContext = createContext<(title: string, description?: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((title: string, description?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, title, description }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-2 px-3" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-[340px] animate-toast-in items-start gap-2.5 rounded-lg border border-line-strong bg-surface-raised/95 px-3 py-2.5 shadow-raised backdrop-blur"
          >
            <Info size={14} className="mt-[2px] shrink-0 text-fg-muted" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
