import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

type Variant = 'success' | 'error' | 'warning' | 'info';

type Toast = {
  id: number;
  variant: Variant;
  title: string;
  message?: string;
};

type ToastInput = Omit<Toast, 'id'>;

type ToastContextValue = {
  push: (toast: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return ctx;
}

const STYLES: Record<Variant, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'ring-emerald-200', iconColor: 'text-emerald-600' },
  error: { icon: XCircle, ring: 'ring-rose-200', iconColor: 'text-rose-600' },
  warning: { icon: AlertTriangle, ring: 'ring-amber-200', iconColor: 'text-amber-600' },
  info: { icon: Info, ring: 'ring-brand-200', iconColor: 'text-brand-600' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    // Teto de 4 avisos na tela: alem disso vira ruido.
    setToasts((list) => [...list.slice(-3), { ...toast, id }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, message) => push({ variant: 'success', title, message }),
      error: (title, message) => push({ variant: 'error', title, message }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { icon: Icon, ring, iconColor } = STYLES[toast.variant];

  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.variant === 'error' ? 7000 : 4500);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.variant]);

  return (
    <div
      className={`pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl bg-white p-3.5 shadow-lift ring-1 ${ring}`}
      role="status"
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-sm leading-snug text-ink-600">{toast.message}</p>}
      </div>
      <button
        onClick={onDismiss}
        className="rounded-lg p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
        aria-label="Fechar aviso"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
