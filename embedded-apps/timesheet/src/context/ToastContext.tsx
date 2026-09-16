'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type Variant = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  variant: Variant;
}
interface ToastContextValue {
  showToast: (message: string, variant?: Variant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let idCounter = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const showToast = useCallback(
    (message: string, variant: Variant = 'success') => {
      const id = idCounter++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      timers.current[id] = setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite" role="status">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const VARIANT_STYLES: Record<Variant, { border: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: { border: 'border-l-green', icon: CheckCircle2, iconColor: 'text-green' },
  error: { border: 'border-l-red', icon: XCircle, iconColor: 'text-red' },
  info: { border: 'border-l-rust', icon: Info, iconColor: 'text-rust' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { border, icon: Icon, iconColor } = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info;
  return (
    <div className={`glass-panel flex items-start gap-3 border-l-4 px-4 py-3 text-sm text-ink animate-slideUp ${border}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${iconColor}`} />
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded text-inkSoft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
