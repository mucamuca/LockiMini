import { useEffect, useState } from 'react';
import { useStockStore } from '../store/stock';
import type { StockInfo } from '../lib/types';

/**
 * Selo de disponibilidade ligado ao canal de tempo real.
 *
 * Quando o numero muda por causa de outra pessoa comprando, o selo pisca — a
 * mudanca precisa ser percebida sem que o cliente precise recarregar a pagina.
 */
export function StockBadge({
  productId,
  fallback,
  variantStock,
  size = 'sm',
}: {
  productId: string;
  fallback: StockInfo;
  /** Quando ha variacao escolhida, e o estoque DELA que o selo mostra. */
  variantStock?: StockInfo;
  size?: 'sm' | 'md';
}) {
  const live = useStockStore((s) => s.live[productId]);
  const stock = variantStock ?? live ?? fallback;
  const flashedAt = useStockStore((s) => s.flashing[productId]);
  const clearFlash = useStockStore((s) => s.clearFlash);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!flashedAt) return;
    setFlash(true);
    const timer = setTimeout(() => {
      setFlash(false);
      clearFlash(productId);
    }, 700);
    return () => clearTimeout(timer);
  }, [flashedAt, productId, clearFlash]);

  const base = size === 'md' ? 'text-sm px-3 py-1.5' : 'text-xs px-2.5 py-1';

  if (stock.outOfStock) {
    return (
      <span className={`chip bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400 ring-1 ring-ink-200 dark:ring-ink-700 ${base}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" aria-hidden />
        Esgotado
      </span>
    );
  }

  if (stock.lowStock) {
    return (
      <span
        className={`chip bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800 ${base} ${flash ? 'animate-pulse-once' : ''}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        Ultimas {stock.available} un.
      </span>
    );
  }

  return (
    <span
      className={`chip bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800 ${base} ${flash ? 'animate-pulse-once' : ''}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
      {stock.available} em estoque
    </span>
  );
}
