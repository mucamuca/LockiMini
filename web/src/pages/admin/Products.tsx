import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { ApiError, api, queryString } from '../../lib/api';
import { money } from '../../lib/format';
import type { AdminProduct, Category, Paginated } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { EmptyState, Field, PageHeading, Spinner, TableSkeleton } from '../../components/ui';

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'low_stock', label: 'Estoque baixo' },
  { value: 'out_of_stock', label: 'Esgotados' },
];

type FormState = {
  sku: string;
  name: string;
  description: string;
  price: string;
  compareAt: string;
  categoryId: string;
  images: string;
  quantity: string;
  lowStockThreshold: string;
  active: boolean;
  featured: boolean;
};

const EMPTY_FORM: FormState = {
  sku: '',
  name: '',
  description: '',
  price: '',
  compareAt: '',
  categoryId: '',
  images: '',
  quantity: '0',
  lowStockThreshold: '5',
  active: true,
  featured: false,
};

export function AdminProducts() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const products = useQuery({
    queryKey: ['admin', 'products', { search, status }],
    queryFn: () =>
      api.get<Paginated<AdminProduct>>(
        `/admin/products${queryString({ search, status, perPage: 100 })}`,
      ),
  });

  const categories = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => api.get<{ items: Category[] }>('/catalog/categories'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ archived?: boolean; message?: string }>(`/admin/products/${id}`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      toast.success(res.archived ? 'Produto desativado' : 'Produto excluido', res.message);
    },
    onError: (err) =>
      toast.error('Nao foi possivel excluir', err instanceof ApiError ? err.message : undefined),
  });

  const items = products.data?.items ?? [];

  return (
    <>
      <PageHeading
        title="Produtos"
        subtitle={`${products.data?.total ?? 0} cadastrados`}
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo produto
          </button>
        }
      />

      <div className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="Buscar por nome ou SKU"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                status === f.value ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {products.isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum produto encontrado" message="Ajuste a busca ou cadastre um novo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/70 text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Produto</th>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-4 py-3 text-right font-semibold">Preco</th>
                  <th className="px-4 py-3 text-center font-semibold">Estoque</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={p.images[0]} alt="" className="h-10 w-10 rounded-lg object-cover"
  decoding="async"
  loading="lazy"/>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900 dark:text-ink-50">{p.name}</p>
                          <p className="font-mono text-xs text-ink-400">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{p.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900 dark:text-ink-50">
                      {money(p.priceCents)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`chip ${
                          p.inventory.available <= 0
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-800'
                            : p.inventory.available <= p.inventory.lowStockThreshold
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800'
                        }`}
                      >
                        {p.inventory.available}
                      </span>
                      {p.inventory.reserved > 0 && (
                        <p className="mt-0.5 text-[11px] text-ink-400">{p.inventory.reserved} reservada(s)</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`chip ${
                          p.active ? 'bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200' : 'bg-ink-100 dark:bg-ink-800 text-ink-400'
                        }`}
                      >
                        {p.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditing(p)}
                          className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-900 dark:hover:text-white"
                          aria-label={`Editar ${p.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Excluir "${p.name}"? Produtos com vendas sao apenas desativados.`)) {
                              remove.mutate(p.id);
                            }
                          }}
                          className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600"
                          aria-label={`Excluir ${p.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <ProductDrawer
          product={editing}
          categories={categories.data?.items ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ProductDrawer({
  product,
  categories,
  onClose,
}: {
  product: AdminProduct | null;
  categories: Category[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(product);

  const [form, setForm] = useState<FormState>(
    product
      ? {
          sku: product.sku,
          name: product.name,
          description: product.description,
          price: (product.priceCents / 100).toFixed(2),
          compareAt: product.compareAtCents ? (product.compareAtCents / 100).toFixed(2) : '',
          categoryId: product.categoryId ?? '',
          images: product.images.join('\n'),
          quantity: String(product.inventory.quantity),
          lowStockThreshold: String(product.inventory.lowStockThreshold),
          active: product.active,
          featured: product.featured,
        }
      : EMPTY_FORM,
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit
        ? api.patch(`/admin/products/${product!.id}`, payload)
        : api.post('/admin/products', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      toast.success(isEdit ? 'Produto atualizado' : 'Produto criado');
      onClose();
    },
    onError: (err) =>
      toast.error('Nao foi possivel salvar', err instanceof ApiError ? err.message : undefined),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const images = form.images
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const base = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      priceCents: Math.round(Number(form.price.replace(',', '.')) * 100),
      compareAtCents: form.compareAt ? Math.round(Number(form.compareAt.replace(',', '.')) * 100) : null,
      categoryId: form.categoryId || null,
      images,
      active: form.active,
      featured: form.featured,
      lowStockThreshold: Number(form.lowStockThreshold),
    };

    // A quantidade so entra na criacao: depois disso o estoque muda por
    // movimentacao auditada, nunca por edicao direta do cadastro.
    save.mutate(isEdit ? base : { ...base, quantity: Number(form.quantity) });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <form
        onSubmit={onSubmit}
        className="relative flex h-full w-full max-w-lg animate-slide-in flex-col bg-white dark:bg-ink-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-ink-100 dark:border-ink-800 px-5 py-4">
          <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">
            {isEdit ? 'Editar produto' : 'Novo produto'}
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scroll-slim flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU">
              <input
                value={form.sku}
                onChange={(e) => set('sku', e.target.value.toUpperCase())}
                className="input font-mono"
                placeholder="CAT-XX-000"
                required
              />
            </Field>
            <Field label="Categoria">
              <select
                value={form.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
                className="input"
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Nome">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className="input" required />
          </Field>

          <Field label="Descricao">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              className="input resize-none"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preco (R$)">
              <input
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                className="input"
                inputMode="decimal"
                placeholder="199.90"
                required
              />
            </Field>
            <Field label="Preco de tabela (opcional)">
              <input
                value={form.compareAt}
                onChange={(e) => set('compareAt', e.target.value)}
                className="input"
                inputMode="decimal"
                placeholder="249.90"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {!isEdit && (
              <Field label="Estoque inicial">
                <input
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value.replace(/\D/g, ''))}
                  className="input"
                  inputMode="numeric"
                />
              </Field>
            )}
            <Field label="Alerta de estoque baixo">
              <input
                value={form.lowStockThreshold}
                onChange={(e) => set('lowStockThreshold', e.target.value.replace(/\D/g, ''))}
                className="input"
                inputMode="numeric"
              />
            </Field>
          </div>

          {isEdit && (
            <p className="rounded-lg bg-ink-50 dark:bg-ink-925 px-3 py-2 text-xs text-ink-500 dark:text-ink-400">
              Estoque atual: <strong className="text-ink-800 dark:text-ink-100">{product!.inventory.quantity} un.</strong> (
              {product!.inventory.reserved} reservada(s)). Para alterar, use a tela de Estoque — assim a
              mudanca fica registrada no historico.
            </p>
          )}

          <Field label="Imagens (uma URL por linha)">
            <textarea
              value={form.images}
              onChange={(e) => set('images', e.target.value)}
              rows={3}
              className="input resize-none font-mono text-xs"
              placeholder="https://..."
            />
          </Field>

          <div className="flex gap-6 border-t border-ink-100 dark:border-ink-800 pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set('active', e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 dark:border-ink-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500"
              />
              Ativo na loja
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => set('featured', e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 dark:border-ink-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500"
              />
              Destaque
            </label>
          </div>
        </div>

        <footer className="flex gap-3 border-t border-ink-100 dark:border-ink-800 bg-ink-50/60 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-outline flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : isEdit ? 'Salvar alteracoes' : 'Criar produto'}
          </button>
        </footer>
      </form>
    </div>
  );
}
