import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Minus, PackageCheck, Plus, RefreshCw, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import type { Product } from '../lib/types';
import { useStockStore } from '../store/stock';
import { useCartActions } from '../hooks/useCart';
import { useToast } from '../components/Toast';
import { ProductCard } from '../components/ProductCard';
import { StockBadge } from '../components/StockBadge';
import { EmptyState, Spinner } from '../components/ui';

export function ProductDetailPage() {
  const { slug = '' } = useParams();
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const seed = useStockStore((s) => s.seed);
  const { add } = useCartActions();
  const toast = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalog', 'product', slug],
    queryFn: () => api.get<{ product: Product; related: Product[] }>(`/catalog/products/${slug}`),
  });

  useEffect(() => {
    if (data) seed([data.product, ...data.related]);
    setQuantity(1);
    setImageIndex(0);
  }, [data, seed]);

  const product = data?.product;
  const liveStock = useStockStore((s) => (product ? s.live[product.id] : undefined));
  const stock = liveStock ?? product?.stock;

  // Se o estoque cair enquanto a pagina esta aberta, a quantidade acompanha.
  useEffect(() => {
    if (stock && quantity > stock.available && stock.available > 0) setQuantity(stock.available);
  }, [stock, quantity]);

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-2">
        <div className="skeleton aspect-square rounded-2xl" />
        <div className="space-y-4">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-9 w-3/4" />
          <div className="skeleton h-6 w-40" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !product || !stock) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          title="Produto nao encontrado"
          message="O link pode estar desatualizado ou o produto saiu do catalogo."
          action={
            <Link to="/catalogo" className="btn-primary">
              Voltar ao catalogo
            </Link>
          }
        />
      </div>
    );
  }

  const discount =
    product.compareAtCents && product.compareAtCents > product.priceCents
      ? Math.round((1 - product.priceCents / product.compareAtCents) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-ink-500">
        <Link to="/" className="hover:text-ink-900">Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/catalogo" className="hover:text-ink-900">Catalogo</Link>
        {product.category && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to={`/catalogo?category=${product.category.slug}`} className="hover:text-ink-900">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
            <img
              src={product.images[imageIndex]}
              alt={product.name}
              className="aspect-square w-full object-cover"
              decoding="async"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-3">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setImageIndex(i)}
                  className={`overflow-hidden rounded-xl border-2 transition ${
                    i === imageIndex ? 'border-brand-600' : 'border-transparent hover:border-ink-200'
                  }`}
                  aria-label={`Imagem ${i + 1}`}
                >
                  <img src={src} alt="" className="h-20 w-20 object-cover"
  decoding="async"
  loading="lazy"/>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {product.category && (
              <span className="chip bg-ink-100 text-ink-600">{product.category.name}</span>
            )}
            <StockBadge productId={product.id} fallback={product.stock} size="md" />
            <span className="text-xs text-ink-400">SKU {product.sku}</span>
          </div>

          <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-ink-900">
            {product.name}
          </h1>

          <div className="mt-5 flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-extrabold tracking-tight text-ink-900">
              {money(product.priceCents)}
            </span>
            {discount > 0 && (
              <>
                <span className="text-lg text-ink-400 line-through">{money(product.compareAtCents!)}</span>
                <span className="chip bg-rose-50 text-rose-700 ring-1 ring-rose-200">-{discount}%</span>
              </>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            em ate 3x de {money(Math.round(product.priceCents / 3))} sem juros · Pix com aprovacao imediata
          </p>

          <p className="mt-6 leading-relaxed text-ink-600">{product.description}</p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-xl border border-ink-200 bg-white">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="px-3 py-3 text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
                aria-label="Diminuir"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-12 text-center text-sm font-bold">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => Math.min(stock.available, q + 1))}
                disabled={quantity >= stock.available}
                className="px-3 py-3 text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
                aria-label="Aumentar"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              className="btn-brand h-[46px] flex-1 text-base"
              disabled={stock.outOfStock || add.isPending}
              onClick={() =>
                add.mutate(
                  { productId: product.id, quantity },
                  {
                    onSuccess: () =>
                      toast.success(
                        'Adicionado ao carrinho',
                        `${quantity}x ${product.name}`,
                      ),
                  },
                )
              }
            >
              {add.isPending ? (
                <Spinner className="h-5 w-5" />
              ) : (
                <>
                  <ShoppingBag className="h-5 w-5" />
                  {stock.outOfStock ? 'Produto esgotado' : 'Adicionar ao carrinho'}
                </>
              )}
            </button>
          </div>

          {stock.lowStock && !stock.outOfStock && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
              Corre: restam apenas {stock.available} unidade(s) e o numero cai em tempo real conforme
              outras pessoas compram.
            </p>
          )}

          <dl className="mt-8 grid gap-4 border-t border-ink-100 pt-6 sm:grid-cols-2">
            {[
              { icon: Truck, title: 'Frete gratis', text: 'Em compras acima de R$ 299.' },
              { icon: ShieldCheck, title: 'Garantia 12 meses', text: 'Direto com o fabricante.' },
              { icon: RefreshCw, title: 'Troca em 30 dias', text: 'Sem custo de devolucao.' },
              { icon: PackageCheck, title: 'Envio em 24h', text: 'Para pedidos aprovados ate 15h.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <dt className="text-sm font-semibold text-ink-900">{title}</dt>
                  <dd className="text-sm text-ink-500">{text}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {data.related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-5 text-xl font-bold tracking-tight text-ink-900">Voce tambem pode gostar</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
