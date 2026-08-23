import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { money } from '../lib/format';
import type { Product } from '../lib/types';
import { useStockStore } from '../store/stock';
import { useCartActions } from '../hooks/useCart';
import { useToast } from './Toast';
import { StockBadge } from './StockBadge';
import { Spinner } from './ui';

/**
 * memo: a grade tem dezenas de cartoes e o estoque ao vivo muda a toda hora.
 * Sem isto, um evento de um unico produto re-renderizava a grade inteira —
 * cada cartao assina apenas o proprio estoque no store.
 */
export const ProductCard = memo(function ProductCard({ product }: { product: Product }) {
  const stock = useStockStore((s) => s.live[product.id]) ?? product.stock;
  const { add } = useCartActions();
  const toast = useToast();

  // Produto com variacao nao pode ser adicionado daqui: falta escolher cor e
  // tamanho. O cartao leva para a pagina, onde a escolha existe.
  const temVariacoes = product.variants.length > 0;
  const preco = temVariacoes ? product.fromPriceCents : product.priceCents;

  const discount =
    product.compareAtCents && product.compareAtCents > preco
      ? Math.round((1 - preco / product.compareAtCents) * 100)
      : 0;

  return (
    <article className="card card-hover group flex flex-col overflow-hidden hover:shadow-lift">
      <Link to={`/produto/${product.slug}`} className="relative block overflow-hidden bg-ink-100 dark:bg-ink-800">
        <img
          src={product.images[0]}
          alt={product.name}
          /* width/height explicitos reservam o espaco antes do carregamento,
             entao a grade nao "pula" e nao ha reflow em cascata. */
          width={600}
          height={600}
          loading="lazy"
          decoding="async"
          className={`aspect-square w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.07] ${
            stock.outOfStock ? 'opacity-60 grayscale' : ''
          }`}
        />
        {discount > 0 && !stock.outOfStock && (
          <span className="absolute left-3 top-3 rounded-lg bg-rose-600 px-2 py-1 text-xs font-bold text-white shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5">
            -{discount}%
          </span>
        )}
        <div className="absolute right-3 top-3">
          <StockBadge productId={product.id} fallback={product.stock} />
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {/* ink-500 e nao ink-400: em branco, o 400 rende 3,17:1 e reprova no
            minimo de 4,5:1 da WCAG para texto normal. */}
        {product.category && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
            {product.category.name}
          </p>
        )}
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink-900 dark:text-ink-50">
          <Link to={`/produto/${product.slug}`} className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto pt-3">
          <div className="flex items-baseline gap-2">
            {temVariacoes && <span className="text-xs text-ink-500 dark:text-ink-400">a partir de</span>}
            <span className="text-lg font-bold tracking-tight text-ink-900 dark:text-ink-50">{money(preco)}</span>
            {discount > 0 && (
              <span className="text-xs text-ink-400 line-through">
                {money(product.compareAtCents!)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            {temVariacoes ? (
              [
                product.options.colors.length > 0 ? product.options.colors.length + ' cores' : null,
                product.options.sizes.length > 0 ? product.options.sizes.length + ' tamanhos' : null,
              ]
                .filter(Boolean)
                .join(' · ')
            ) : (
              <>ou 3x de {money(Math.round(preco / 3))} sem juros</>
            )}
          </p>

          {temVariacoes ? (
            <Link
              to={`/produto/${product.slug}`}
              className={`btn-outline mt-3 w-full ${stock.outOfStock ? 'pointer-events-none opacity-50' : ''}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {stock.outOfStock ? 'Indisponivel' : 'Escolher opcoes'}
            </Link>
          ) : (
          <button
            className="btn-primary mt-3 w-full"
            disabled={stock.outOfStock || add.isPending}
            onClick={() =>
              add.mutate(
                { productId: product.id },
                { onSuccess: () => toast.success('Adicionado ao carrinho', product.name) },
              )
            }
          >
            {add.isPending ? (
              <Spinner />
            ) : (
              <>
                <ShoppingBag className="h-4 w-4 transition-transform duration-200 group-hover:-rotate-6" />
                {stock.outOfStock ? 'Indisponivel' : 'Adicionar'}
              </>
            )}
          </button>
          )}
        </div>
      </div>
    </article>
  );
});
