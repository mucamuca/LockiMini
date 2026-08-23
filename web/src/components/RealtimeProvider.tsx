import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useStockStore } from '../store/stock';
import type { Cart, StockEvent } from '../lib/types';
import { useToast } from './Toast';

type RealtimeContextValue = { connected: boolean };
const RealtimeContext = createContext<RealtimeContextValue>({ connected: false });

export const useRealtime = () => useContext(RealtimeContext);

/**
 * Uma conexao WebSocket para a aplicacao inteira.
 *
 * O servidor empurra `stock:update` sempre que o disponivel de um produto muda —
 * por venda, cancelamento, reserva expirada ou ajuste do admin. Quem estiver com
 * a pagina aberta ve o numero mudar sem recarregar.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  // Refs para o efeito nao depender de nada que mude: a conexao e criada uma vez.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const socket: Socket = io({
      path: '/realtime',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // --- Agrupamento de eventos de estoque -------------------------------
    // Numa promocao chegam dezenas de eventos por segundo. Sem isto, cada um
    // vira um render e uma possivel revalidacao de query.
    //
    // A janela e um setTimeout curto, nao requestAnimationFrame: rAF nao dispara
    // em aba de segundo plano, e a loja aberta numa aba escondida ficaria com o
    // estoque congelado ate o usuario voltar.
    const BATCH_MS = 60;
    let buffer: StockEvent[] = [];
    let timer: number | null = null;

    const flush = () => {
      timer = null;
      const batch = buffer;
      buffer = [];
      if (batch.length === 0) return;

      useStockStore.getState().applyMany(batch);

      // O carrinho so precisa ser revalidado se algum item DELE mudou. Antes,
      // qualquer produto da loja disparava um refetch do carrinho — numa loja
      // movimentada isso vira uma requisicao atras da outra sem motivo.
      const cart = queryClient.getQueryData<Cart>(['cart']);
      if (cart && cart.items.length > 0) {
        const affected = new Set(batch.map((e) => e.productId));
        if (cart.items.some((item) => affected.has(item.productId))) {
          queryClient.invalidateQueries({ queryKey: ['cart'] });
        }
      }
    };

    socket.on('stock:update', (event: StockEvent) => {
      buffer.push(event);
      timer ??= window.setTimeout(flush, BATCH_MS);
    });

    // Painel admin: pedidos entram e mudam de status ao vivo.
    socket.on('order:created', () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    });

    socket.on('order:updated', (payload: { number: string; status: string }) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', payload.number] });
    });

    socket.on('stock:low', (event: StockEvent) => {
      // Alerta so chega para quem esta em sala de admin.
      toastRef.current.push({
        variant: event.outOfStock ? 'error' : 'warning',
        title: event.outOfStock ? 'Produto esgotado' : 'Estoque baixo',
        message: `${event.sku} — ${event.available} un. disponiveis.`,
      });
    });

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      socket.close();
    };
  }, [queryClient]);

  const value = useMemo(() => ({ connected }), [connected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
