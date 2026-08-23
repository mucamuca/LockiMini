import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { money } from '../lib/format';
import { useCart, useCartActions } from '../hooks/useCart';
import { EmptyState, PageHeading } from '../components/ui';

export function CartPage() {
  const { cart, loading } = useCart();
  const { update, remove, clear, busy } = useCartActions();

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="skeleton mb-6 h-9 w-48" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          icon={<ShoppingBag className="h-12 w-12" />}
          title="Seu carrinho esta vazio"
          message="Explore o catalogo e adicione o que voce quiser — o estoque exibido e o real."
          action={
            <Link to="/catalogo" className="btn-primary">
              Ver catalogo <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeading
        title="Carrinho"
        subtitle={`${cart.itemCount} item(ns)`}
        actions={
          <button className="btn-ghost text-sm text-rose-600 dark:text-rose-400" onClick={() => clear.mutate()} disabled={busy}>
            <Trash2 className="h-4 w-4" /> Esvaziar
          </button>
        }
      />

      {cart.hasIssues && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Alguns itens mudaram de disponibilidade</p>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200">
              Ajuste as quantidades marcadas abaixo para continuar. Isso acontece quando outra pessoa
              compra as ultimas unidades enquanto voce navega.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <ul className="space-y-3">
          {cart.items.map((item) => (
            <li
              key={item.id}
              className={`card flex flex-col gap-4 p-4 sm:flex-row ${
                item.issue ? 'border-amber-200 bg-amber-50/40' : ''
              }`}
            >
              <Link to={`/produto/${item.slug}`} className="shrink-0">
                <img
                  src={item.imageUrl ?? ''}
                  alt={item.name}
                  className="h-28 w-28 rounded-xl object-cover"
                  decoding="async"
                  loading="lazy"
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      to={`/produto/${item.slug}`}
                      className="font-semibold text-ink-900 dark:text-ink-50 hover:text-brand-700 dark:hover:text-brand-400"
                    >
                      {item.name}
                    </Link>
                    {item.variantLabel && (
                      <span className="chip mt-1 bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">{item.variantLabel}</span>
                    )}
                    <p className="mt-0.5 text-xs text-ink-400">SKU {item.sku}</p>
                    <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{money(item.unitPriceCents)} cada</p>
                  </div>
                  <button
                    onClick={() => remove.mutate(item.id)}
                    disabled={busy}
                    className="rounded-lg p-2 text-ink-400 transition hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600"
                    aria-label={`Remover ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {item.issue && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    {item.issue}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex items-center rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900">
                    <button
                      onClick={() => update.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                      disabled={busy}
                      className="px-2.5 py-2 text-ink-600 dark:text-ink-300 transition hover:bg-ink-50 dark:hover:bg-ink-850 disabled:opacity-40"
                      aria-label="Diminuir"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-10 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      onClick={() => update.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                      disabled={busy || item.quantity >= item.stock.available}
                      className="px-2.5 py-2 text-ink-600 dark:text-ink-300 transition hover:bg-ink-50 dark:hover:bg-ink-850 disabled:opacity-40"
                      aria-label="Aumentar"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-lg font-bold text-ink-900 dark:text-ink-50">{money(item.totalCents)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5">
            <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">Resumo</h2>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-ink-600 dark:text-ink-300">
                <dt>Subtotal</dt>
                <dd className="font-medium text-ink-900 dark:text-ink-50">{money(cart.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between text-ink-600 dark:text-ink-300">
                <dt>Frete</dt>
                <dd className={cart.shippingCents === 0 ? 'font-semibold text-emerald-600' : 'font-medium text-ink-900 dark:text-ink-50'}>
                  {cart.shippingCents === 0 ? 'Gratis' : money(cart.shippingCents)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink-100 dark:border-ink-800 pt-3 text-lg font-bold text-ink-900 dark:text-ink-50">
                <dt>Total</dt>
                <dd>{money(cart.totalCents)}</dd>
              </div>
            </dl>

            {cart.missingForFreeShippingCents > 0 && (
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{
                      width: `${Math.min(100, (cart.subtotalCents / cart.freeShippingThresholdCents) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                  Faltam <strong className="text-ink-800 dark:text-ink-100">{money(cart.missingForFreeShippingCents)}</strong> para
                  frete gratis.
                </p>
              </div>
            )}

            <Link
              to="/checkout"
              className={`btn-brand mt-5 w-full ${cart.hasIssues ? 'pointer-events-none opacity-50' : ''}`}
              aria-disabled={cart.hasIssues}
            >
              Ir para o checkout <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/catalogo" className="btn-ghost mt-1.5 w-full">
              Continuar comprando
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
