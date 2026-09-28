'use client';

// App-wide stand-ins for the three imperative sap.m / sap.ui.core APIs every Fiori controller in the
// source app leans on: sap.m.MessageBox (error/success/warning/information/confirm, with onClose),
// sap.m.MessageToast.show and sap.ui.core.BusyIndicator.show/hide. Exposed through useUi() so ported
// screen code reads like the original — ui.messageBox.error(msg), ui.toast(msg), ui.busy(true).
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, HelpCircle } from 'lucide-react';

export type MessageBoxAction = 'OK' | 'CANCEL' | 'YES' | 'NO' | 'CLOSE';
type MessageKind = 'error' | 'success' | 'warning' | 'information' | 'confirm';

interface MessageBoxOptions {
  title?: string;
  actions?: MessageBoxAction[];
  emphasizedAction?: MessageBoxAction;
  onClose?: (action: MessageBoxAction) => void;
}

interface MessageEntry {
  id: number;
  kind: MessageKind;
  message: string;
  options: MessageBoxOptions;
}

interface MessageBoxApi {
  error: (message: string, options?: MessageBoxOptions) => Promise<MessageBoxAction>;
  success: (message: string, options?: MessageBoxOptions) => Promise<MessageBoxAction>;
  warning: (message: string, options?: MessageBoxOptions) => Promise<MessageBoxAction>;
  information: (message: string, options?: MessageBoxOptions) => Promise<MessageBoxAction>;
  /** Defaults to OK/Cancel, like sap.m.MessageBox.confirm. */
  confirm: (message: string, options?: MessageBoxOptions) => Promise<MessageBoxAction>;
  /** Alias for sap.m.MessageBox.show — treated as information. */
  show: (message: string, options?: MessageBoxOptions) => Promise<MessageBoxAction>;
}

interface UiApi {
  messageBox: MessageBoxApi;
  toast: (message: string) => void;
  busy: (on: boolean) => void;
}

const UiContext = createContext<UiApi | null>(null);

const TITLES: Record<MessageKind, string> = {
  error: 'Error',
  success: 'Success',
  warning: 'Warning',
  information: 'Information',
  confirm: 'Confirmation',
};

const ICONS: Record<MessageKind, React.ReactNode> = {
  error: <XCircle className="text-red" size={22} />,
  success: <CheckCircle2 className="text-green" size={22} />,
  warning: <AlertTriangle className="text-amber" size={22} />,
  information: <Info className="text-blue" size={22} />,
  confirm: <HelpCircle className="text-rust" size={22} />,
};

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [busyCount, setBusyCount] = useState(0);
  const idRef = useRef(0);
  const resolvers = useRef(new Map<number, (a: MessageBoxAction) => void>());

  const open = useCallback((kind: MessageKind, message: string, options: MessageBoxOptions = {}) => {
    idRef.current += 1;
    const id = idRef.current;
    return new Promise<MessageBoxAction>((resolve) => {
      resolvers.current.set(id, resolve);
      setMessages((m) => [...m, { id, kind, message: String(message ?? ''), options }]);
    });
  }, []);

  const close = useCallback((entry: MessageEntry, action: MessageBoxAction) => {
    setMessages((m) => m.filter((x) => x.id !== entry.id));
    entry.options.onClose?.(action);
    resolvers.current.get(entry.id)?.(action);
    resolvers.current.delete(entry.id);
  }, []);

  const toast = useCallback((message: string) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((t) => [...t, { id, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const busy = useCallback((on: boolean) => {
    setBusyCount((c) => Math.max(0, c + (on ? 1 : -1)));
  }, []);

  const api = useMemo<UiApi>(
    () => ({
      messageBox: {
        error: (m, o) => open('error', m, o),
        success: (m, o) => open('success', m, o),
        warning: (m, o) => open('warning', m, o),
        information: (m, o) => open('information', m, o),
        confirm: (m, o) => open('confirm', m, { actions: ['OK', 'CANCEL'], ...o }),
        show: (m, o) => open('information', m, o),
      },
      toast,
      busy,
    }),
    [open, toast, busy],
  );

  const top = messages[messages.length - 1];

  return (
    <UiContext.Provider value={api}>
      {children}

      {busyCount > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
        </div>
      )}

      {top && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-plumDeep/40 p-4 backdrop-blur-sm">
          <div role="alertdialog" className="w-full max-w-md animate-slideUp rounded-xl2 border border-border bg-white shadow-pop">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              {ICONS[top.kind]}
              <h2 className="text-[14px] font-bold text-ink">{top.options.title || TITLES[top.kind]}</h2>
            </div>
            <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap px-4 py-4 text-[13px] text-ink">{top.message}</div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              {(top.options.actions || ['OK']).map((a, i) => {
                const emphasized = top.options.emphasizedAction ? top.options.emphasizedAction === a : i === 0;
                return (
                  <button
                    key={a}
                    type="button"
                    autoFocus={emphasized}
                    onClick={() => close(top, a)}
                    className={emphasized ? 'btn-primary !py-1.5' : 'btn-ghost !py-1.5'}
                  >
                    {a === 'CANCEL' ? 'Cancel' : a === 'YES' ? 'Yes' : a === 'NO' ? 'No' : a === 'CLOSE' ? 'Close' : 'OK'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="animate-fadeIn rounded-lg bg-plumDeep/90 px-4 py-2 text-[12.5px] font-semibold text-white shadow-pop">
            {t.message}
          </div>
        ))}
      </div>
    </UiContext.Provider>
  );
}

export function useUi(): UiApi {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside UiProvider');
  return ctx;
}
