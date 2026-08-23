import { create } from 'zustand';
import type { Product, StockEvent, StockInfo } from '../lib/types';

type StockState = {
  /** Estoque ao vivo por produto. Sobrepoe o que veio no HTML/JSON inicial. */
  live: Record<string, StockInfo>;
  /** Produtos que acabaram de mudar — usado so para piscar o badge. */
  flashing: Record<string, number>;
  applyMany: (events: StockEvent[]) => void;
  seed: (products: Pick<Product, 'id' | 'stock'>[]) => void;
  clearFlash: (productId: string) => void;
};

export const useStockStore = create<StockState>((set) => ({
  live: {},
  flashing: {},

  /**
   * Aplica um lote de eventos numa unica atualizacao.
   *
   * Numa loja movimentada chegam varios `stock:update` no mesmo instante. Um
   * `set` por evento significa um render por evento; agrupando, a arvore
   * re-renderiza uma vez so. O provider acumula os eventos e chama isto.
   */
  applyMany: (events) =>
    set((state) => {
      if (events.length === 0) return state;

      let liveChanged = false;
      let flashChanged = false;
      const live = { ...state.live };
      const flashing = { ...state.flashing };
      const now = Date.now();

      for (const event of events) {
        const previous = live[event.productId];
        const next: StockInfo = {
          available: event.available,
          lowStock: event.lowStock,
          outOfStock: event.outOfStock,
        };
        if (
          previous &&
          previous.available === next.available &&
          previous.lowStock === next.lowStock &&
          previous.outOfStock === next.outOfStock
        ) {
          continue; // evento repetido: nada muda, nada re-renderiza
        }
        // So pisca quando o numero em si mudou.
        if (previous && previous.available !== next.available) {
          flashing[event.productId] = now;
          flashChanged = true;
        }
        live[event.productId] = next;
        liveChanged = true;
      }

      if (!liveChanged && !flashChanged) return state;
      return {
        live: liveChanged ? live : state.live,
        flashing: flashChanged ? flashing : state.flashing,
      };
    }),

  seed: (products) =>
    set((state) => {
      let changed = false;
      const live = { ...state.live };
      for (const p of products) {
        // O socket e a fonte mais recente: nao sobrescrevemos o que veio por ele.
        if (live[p.id] === undefined) {
          live[p.id] = p.stock;
          changed = true;
        }
      }
      return changed ? { live } : state;
    }),

  clearFlash: (productId) =>
    set((state) => {
      if (state.flashing[productId] === undefined) return state;
      const flashing = { ...state.flashing };
      delete flashing[productId];
      return { flashing };
    }),
}));

/** Estoque efetivo: o do socket quando existe, senao o que veio na resposta. */
export function useLiveStock(productId: string, fallback: StockInfo): StockInfo {
  return useStockStore((s) => s.live[productId]) ?? fallback;
}
