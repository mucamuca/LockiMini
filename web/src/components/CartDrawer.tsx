import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { money } from '../lib/format';
import { useCart, useCartActions } from '../hooks/useCart';
import { Spinner } from './ui';

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cart, loading } = useCart();
  const { update, remove, busy } = useCartActions();

  // Esc fecha e o body para de rolar enquanto a gaveta esta aberta.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const empty = !loading && (!cart || cart.items.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Carrinho">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />

      <aside className="relative flex h-full w-full max-w-md animate-slide-in flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <ShoppingBag className="h-5 w-5" />
            Seu carrinho
            {cart && cart.itemCount > 0 && (
              <span className="rounded-full bg-ink-900 px-2 py-0.5 text-xs font-bold text-white">
                {cart.itemCount}
              </span>
            )}
          </h2>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="Fechar carrinho">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-24" />
              ))}
            </div>
          )}

          {empty && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <ShoppingBag className="mb-4 h-12 w-12 text-ink-200" />
              <p className="font-semibold text-ink-800">Seu carrinho esta vazio</p>
              <p className="mt-1 text-sm text-ink-500">Que tal comecar pelos destaques?</p>
              <Link to="/catalogo" onClick={onClose} className="btn-primary mt-5">
                Ver catalogo
              </Link>
            </div>
          )}

          <ul className="space-y-3">
            {cart?.items.map((item) => (
              <li
                key={item.id}
                className={`flex gap-3 rounded-xl border p-3 ${
                  item.issue ? 'border-amber-200 bg-amber-50/50' : 'border-ink-100'
                }`}
              >
                <img
                  src={item.imageUrl ?? ''}
                  alt={item.name}
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                  decoding="async"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/produto/${item.slug}`}
                    onClick={onClose}
                    className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {item.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">{money(item.unitPriceCents)} cada</p>

                  {item.issue && (
                    <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-amber-700">
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                      {item.issue}
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center rounded-lg border border-ink-200">
                      <button
                        className="px-2 py-1 text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
                        disabled={busy}
                        onClick={() => update.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                        aria-label="Diminuir quantidade"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-8 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        className="px-2 py-1 text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
                        disabled={busy || item.quantity >= item.stock.available}
                        onClick={() => update.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                        aria-label="Aumentar quantidade"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink-900">{money(item.totalCents)}</span>
                      <button
                        className="rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600"
                        disabled={busy}
                        onClick={() => remove.mutate(item.id)}
                        aria-label={`Remover ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {cart && cart.items.length > 0 && (
          <footer className="border-t border-ink-100 bg-ink-50/60 px-5 py-4">
            {cart.missingForFreeShippingCents > 0 ? (
              <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">
                Faltam {money(cart.missingForFreeShippingCents)} para frete gratis.
              </p>
            ) : (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                Frete gratis liberado.
              </p>
            )}

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-ink-600">
                <dt>Subtotal</dt>
                <dd>{money(cart.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between text-ink-600">
                <dt>Frete</dt>
                <dd>{cart.shippingCents === 0 ? 'Gratis' : money(cart.shippingCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold text-ink-900">
                <dt>Total</dt>
                <dd>{money(cart.totalCents)}</dd>
              </div>
            </dl>

            <Link to="/checkout" onClick={onClose} className="btn-brand mt-4 w-full">
              {busy ? <Spinner /> : 'Finalizar compra'}
            </Link>
            <Link to="/carrinho" onClick={onClose} className="btn-ghost mt-1.5 w-full">
              Ver carrinho completo
            </Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
