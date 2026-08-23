import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SearchX, SlidersHorizontal } from 'lucide-react';
import { api, queryString } from '../lib/api';
import type { Category, Paginated, Product } from '../lib/types';
import { useStockStore } from '../store/stock';
import { ProductCard } from '../components/ProductCard';
import { Reveal } from '../components/Reveal';
import { EmptyState, Pagination, ProductCardSkeleton } from '../components/ui';

const SORTS = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'price_asc', label: 'Menor preco' },
  { value: 'price_desc', label: 'Maior preco' },
  { value: 'name', label: 'Nome (A-Z)' },
];

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const seed = useStockStore((s) => s.seed);

  const filters = {
    search: params.get('search') ?? '',
    category: params.get('category') ?? '',
    sort: params.get('sort') ?? 'recent',
    inStock: params.get('inStock') === 'true',
    featured: params.get('featured') === 'true',
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
    page: Number(params.get('page') ?? 1),
  };

  /** Escreve um filtro na URL — a busca fica compartilhavel e o voltar funciona. */
  const setFilter = (key: string, value: string | boolean) => {
    const next = new URLSearchParams(params);
    if (value === '' || value === false) next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const categories = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => api.get<{ items: Category[] }>('/catalog/categories'),
  });

  const products = useQuery({
    queryKey: ['catalog', 'products', filters],
    queryFn: () =>
      api.get<Paginated<Product>>(
        `/catalog/products${queryString({
          search: filters.search,
          category: filters.category,
          sort: filters.sort,
          inStock: filters.inStock,
          featured: filters.featured,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          page: filters.page,
          perPage: 12,
        })}`,
      ),
  });

  useEffect(() => {
    if (products.data?.items) seed(products.data.items);
  }, [products.data, seed]);

  const activeCount = [
    filters.category,
    filters.search,
    filters.inStock,
    filters.featured,
    filters.minPrice,
    filters.maxPrice,
  ].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          {filters.search ? `Resultados para "${filters.search}"` : 'Catalogo'}
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {products.isLoading
            ? 'Carregando produtos...'
            : `${products.data?.total ?? 0} produto(s) encontrado(s)`}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <SlidersHorizontal className="h-4 w-4" /> Filtros
              </h2>
              {activeCount > 0 && (
                <button
                  onClick={() => setParams({}, { replace: true })}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Limpar ({activeCount})
                </button>
              )}
            </div>

            <div className="mt-5">
              <p className="label">Categoria</p>
              <div className="space-y-1">
                <button
                  onClick={() => setFilter('category', '')}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    !filters.category ? 'bg-ink-900 font-semibold text-white' : 'text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  Todas
                </button>
                {categories.data?.items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setFilter('category', c.slug)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                      filters.category === c.slug
                        ? 'bg-ink-900 font-semibold text-white'
                        : 'text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    {c.name}
                    <span className="text-xs opacity-60">{c.productCount}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="label">Faixa de preco (R$)</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="min"
                  defaultValue={filters.minPrice}
                  onBlur={(e) => setFilter('minPrice', e.target.value)}
                  className="input"
                />
                <span className="text-ink-400">–</span>
                <input
                  type="number"
                  min={0}
                  placeholder="max"
                  defaultValue={filters.maxPrice}
                  onBlur={(e) => setFilter('maxPrice', e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div className="mt-5 space-y-2.5 border-t border-ink-100 pt-5">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={filters.inStock}
                  onChange={(e) => setFilter('inStock', e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                Somente disponiveis
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={filters.featured}
                  onChange={(e) => setFilter('featured', e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                Apenas destaques
              </label>
            </div>
          </div>
        </aside>

        <div>
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-sm text-ink-500">
              Pagina {filters.page} de {products.data?.totalPages ?? 1}
            </p>
            <select
              value={filters.sort}
              onChange={(e) => setFilter('sort', e.target.value)}
              className="input w-auto"
              aria-label="Ordenar por"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {products.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : (products.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<SearchX className="h-10 w-10" />}
              title="Nenhum produto encontrado"
              message="Tente outra combinacao de filtros ou uma busca mais ampla."
              action={
                <button onClick={() => setParams({}, { replace: true })} className="btn-primary">
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.data!.items.map((p, i) => (
                // Escalonamento so nas primeiras linhas: passar disso o usuario
                // ja rolou e a espera vira incomodo, nao charme.
                <Reveal key={p.id} delay={Math.min(i, 5) * 70}>
                  <ProductCard product={p} />
                </Reveal>
              ))}
            </div>
          )}

          <Pagination
            page={filters.page}
            totalPages={products.data?.totalPages ?? 1}
            onChange={(p) => setFilter('page', String(p))}
          />
        </div>
      </div>
    </div>
  );
}
