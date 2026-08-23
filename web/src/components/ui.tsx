import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { ORDER_STATUS } from '../lib/format';
import type { OrderStatus } from '../lib/types';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 dark:text-ink-50 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Campo de formulario com rotulo.
 *
 * O <label> envolve o controle (rotulagem implicita), entao leitores de tela
 * anunciam o nome do campo sem precisar sincronizar id/htmlFor a mao.
 */
export function Field({
  label,
  error,
  hint,
  className = '',
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-ink-500 dark:text-ink-400">{hint}</span>}
      {error && <span className="field-error block">{error}</span>}
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 dark:border-ink-700 bg-white/60 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-ink-300">{icon}</div>}
      <p className="text-base font-semibold text-ink-800 dark:text-ink-100">{title}</p>
      {message && <p className="mt-1.5 max-w-sm text-sm text-ink-500 dark:text-ink-400">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const info = ORDER_STATUS[status];
  return (
    <span className={`chip ${info.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} aria-hidden />
      {info.label}
    </span>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Janela deslizante: no maximo 5 numeros, sempre com a pagina atual no meio.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);

  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Paginacao">
      <button
        className="btn-ghost px-2.5"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Pagina anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`h-9 min-w-9 rounded-xl px-3 text-sm font-semibold transition ${
            p === page ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        className="btn-ghost px-2.5"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Proxima pagina"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-square rounded-none" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-6 w-24" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="skeleton h-10" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Grafico de barras minimo em SVG — sem dependencia de biblioteca. */
export function BarChart({
  data,
  height = 160,
  formatValue,
}: {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} className="group relative flex flex-1 flex-col justify-end" style={{ height }}>
            <div
              className="w-full rounded-t-md bg-brand-500/20 transition-colors group-hover:bg-brand-500/40"
              style={{ height: `${Math.max(pct, 2)}%` }}
            >
              <div
                className="h-full w-full rounded-t-md bg-brand-600 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ opacity: pct > 0 ? 1 : 0 }}
              />
            </div>
            <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lift transition-opacity group-hover:opacity-100">
              {d.label}: {formatValue ? formatValue(d.value) : d.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
