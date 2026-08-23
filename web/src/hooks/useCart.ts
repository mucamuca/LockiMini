import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import type { Cart } from '../lib/types';
import { useToast } from '../components/Toast';

const CART_KEY = ['cart'];

export function useCart() {
  const { data, isLoading } = useQuery({
    queryKey: CART_KEY,
    queryFn: async () => (await api.get<{ cart: Cart }>('/cart')).cart,
    staleTime: 15_000,
  });
  return { cart: data ?? null, loading: isLoading };
}

/**
 * Mutacoes do carrinho.
 *
 * O backend sempre devolve o carrinho inteiro depois de mudar, entao gravamos a
 * resposta direto no cache: nao existe janela em que a tela mostre um total
 * diferente do que o servidor calculou.
 */
export function useCartActions() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const write = (cart: Cart) => queryClient.setQueryData(CART_KEY, cart);

  const onError = (err: unknown) => {
    if (err instanceof ApiError) {
      toast.error(
        err.code === 'insufficient_stock' || err.code === 'out_of_stock'
          ? 'Estoque insuficiente'
          : 'Nao deu certo',
        err.message,
      );
      // Estoque mudou embaixo do cliente: recarrega para mostrar o numero real.
      if (err.code === 'insufficient_stock' || err.code === 'out_of_stock') {
        queryClient.invalidateQueries({ queryKey: CART_KEY });
        queryClient.invalidateQueries({ queryKey: ['catalog'] });
      }
    } else {
      toast.error('Nao deu certo', 'Tente novamente em instantes.');
    }
  };

  const add = useMutation({
    mutationFn: (input: { productId: string; quantity?: number; variantId?: string }) =>
      api.post<{ cart: Cart }>('/cart/items', {
        productId: input.productId,
        quantity: input.quantity ?? 1,
        // Omitido para produto sem variacao — o servidor recusa se vier a toa.
        ...(input.variantId ? { variantId: input.variantId } : {}),
      }),
    onSuccess: (res) => write(res.cart),
    onError,
  });

  const update = useMutation({
    mutationFn: (input: { itemId: string; quantity: number }) =>
      api.patch<{ cart: Cart }>(`/cart/items/${input.itemId}`, { quantity: input.quantity }),
    onSuccess: (res) => write(res.cart),
    onError,
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => api.delete<{ cart: Cart }>(`/cart/items/${itemId}`),
    onSuccess: (res) => write(res.cart),
    onError,
  });

  const clear = useMutation({
    mutationFn: () => api.delete<{ cart: Cart }>('/cart'),
    onSuccess: (res) => write(res.cart),
    onError,
  });

  return {
    add,
    update,
    remove,
    clear,
    busy: add.isPending || update.isPending || remove.isPending || clear.isPending,
  };
}
