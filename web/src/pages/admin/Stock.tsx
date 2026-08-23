import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Minus, Plus, RefreshCw, Search, X } from 'lucide-react';
import { ApiError, api, queryString } from '../../lib/api';
import { STOCK_REASON_LABEL, dateTime, money, relativeTime } from '../../lib/format';
import type { StockMovement, StockRow } from '../../lib/types';
import { useStockStore } from '../../store/stock';
import { useToast } from '../../components/Toast';
import { EmptyState, Field, PageHeading, Spinner, TableSkeleton } from '../../components/ui';

type StockResponse = {
  items: StockRow[];
  summary: {
    totalSkus: number;
    outOfStock: number;
    lowStock: number;
    unitsOnHand: number;
    unitsReserved: number;
  };
};

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'low', label: 'Estoque baixo' },
  { value: 'out', label: 'Esgotados' },
  { value: 'reserved', label: 'Com reserva' },
];

export function AdminStock() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [adjusting, setAdjusting] = useState<StockRow | null>(null);
  const [historyOf, setHistoryOf] = useState<StockRow | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const live = useStockStore((s) => s.live);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stock', { filter, search }],
    queryFn: () => api.get<StockResponse>(`/admin/stock${queryString({ filter, search })}`),
  });

  const expire = useMutation({
    mutationFn: () => api.post<{ orders: number }>('/admin/stock/expire-reservations'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success(
        'Limpeza executada',
        res.orders > 0
          ? `${res.orders} pedido(s) expirado(s); unidades devolvidas ao catalogo.`
          : 'Nenhuma reserva vencida encontrada.',
      );
    },
  });

  const rows = data?.items ?? [];

  return (
    <>
      <PageHeading
        title="Estoque"
        subtitle="Fisico, reservado e disponivel — atualizado em tempo real"
        actions={
          <button onClick={() => expire.mutate()} disabled={expire.isPending} className="btn-outline">
            {expire.isPending ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            Liberar reservas vencidas
          </button>
        }
      />

      {data && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="SKUs cadastrados" value={String(data.summary.totalSkus)} />
          <Summary label="Unidades em maos" value={String(data.summary.unitsOnHand)} />
          <Summary
            label="Reservadas em pedidos"
            value={String(data.summary.unitsReserved)}
            tone={data.summary.unitsReserved > 0 ? 'warning' : undefined}
          />
          <Summary
            label="Esgotados"
            value={String(data.summary.outOfStock)}
            tone={data.summary.outOfStock > 0 ? 'danger' : undefined}
          />
        </div>
      )}

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
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                filter === f.value ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nada por aqui" message="Nenhum item corresponde a este filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/70 text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Produto</th>
                  <th className="px-4 py-3 text-center font-semibold">Fisico</th>
                  <th className="px-4 py-3 text-center font-semibold">Reservado</th>
                  <th className="px-4 py-3 text-center font-semibold">Disponivel</th>
                  <th className="px-4 py-3 font-semibold">Atualizado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {rows.map((row) => {
                  // O socket pode ter trazido um numero mais novo que a listagem.
                  const available = live[row.productId]?.available ?? row.available;
                  const low = available > 0 && available <= row.lowStockThreshold;
                  return (
                    <tr key={row.productId} className="hover:bg-ink-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={row.imageUrl ?? ''} alt="" className="h-10 w-10 rounded-lg object-cover"
  decoding="async"
  loading="lazy"/>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900 dark:text-ink-50">{row.name}</p>
                            {row.variantLabel && (
                              <span className="chip mt-0.5 bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
                                {row.colorHex && (
                                  <span
                                    className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                                    style={{ backgroundColor: row.colorHex }}
                                    aria-hidden
                                  />
                                )}
                                {row.variantLabel}
                              </span>
                            )}
                            <p className="font-mono text-xs text-ink-400">
                              {row.sku} · {money(row.priceCents)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-ink-900 dark:text-ink-50">{row.quantity}</td>
                      <td className="px-4 py-3 text-center">
                        {row.reserved > 0 ? (
                          <span className="chip bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
                            {row.reserved}
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`chip ${
                            available <= 0
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-800'
                              : low
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800'
                          }`}
                        >
                          {available}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">{relativeTime(row.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setHistoryOf(row)}
                            className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-900 dark:hover:text-white"
                            aria-label={`Historico de ${row.name}`}
                          >
                            <History className="h-4 w-4" />
                          </button>
                          <button onClick={() => setAdjusting(row)} className="btn-outline px-3 py-1.5 text-xs">
                            Ajustar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adjusting && <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />}
      {historyOf && <HistoryDialog row={historyOf} onClose={() => setHistoryOf(null)} />}
    </>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'danger';
}) {
  const color =
    tone === 'danger' ? 'text-rose-600 dark:text-rose-400' : tone === 'warning' ? 'text-amber-600' : 'text-ink-900 dark:text-ink-50';
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
    </div>
  );
}

function AdjustDialog({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const [mode, setMode] = useState<'delta' | 'absolute'>('delta');
  const [delta, setDelta] = useState(1);
  const [absolute, setAbsolute] = useState(row.quantity);
  const [reason, setReason] = useState('PURCHASE_ORDER');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();

  const save = useMutation({
    mutationFn: () =>
      mode === 'delta'
        ? api.post(`/admin/stock/${row.productId}/adjust`, {
            delta,
            reason,
            note: note || undefined,
            ...(row.variantId ? { variantId: row.variantId } : {}),
          })
        : api.post(`/admin/stock/${row.productId}/set`, {
            quantity: absolute,
            note: note || undefined,
            ...(row.variantId ? { variantId: row.variantId } : {}),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      toast.success('Estoque atualizado', 'A loja ja esta mostrando o novo numero.');
      onClose();
    },
    onError: (err) =>
      toast.error('Ajuste recusado', err instanceof ApiError ? err.message : 'Tente novamente.'),
  });

  const projected = mode === 'delta' ? row.quantity + delta : absolute;
  const invalid = projected < row.reserved;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative w-full max-w-md animate-fade-up rounded-2xl bg-white dark:bg-ink-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">Ajustar estoque</h2>
            <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{row.name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-ink-50 dark:bg-ink-925 p-3 text-center text-sm">
          <div>
            <p className="text-xs text-ink-400">Fisico</p>
            <p className="font-bold text-ink-900 dark:text-ink-50">{row.quantity}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Reservado</p>
            <p className="font-bold text-amber-600">{row.reserved}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Disponivel</p>
            <p className="font-bold text-emerald-600">{row.available}</p>
          </div>
        </div>

        <div className="mt-5 flex rounded-xl border border-ink-200 dark:border-ink-700 p-1">
          <button
            onClick={() => setMode('delta')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === 'delta' ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300'
            }`}
          >
            Entrada / saida
          </button>
          <button
            onClick={() => setMode('absolute')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === 'absolute' ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300'
            }`}
          >
            Contagem
          </button>
        </div>

        {mode === 'delta' ? (
          <>
            <Field label="Quantidade" className="mt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDelta((d) => d - 1)}
                  className="btn-outline px-3"
                  aria-label="Diminuir"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  value={delta}
                  onChange={(e) => setDelta(Number(e.target.value))}
                  className="input text-center"
                />
                <button
                  type="button"
                  onClick={() => setDelta((d) => d + 1)}
                  className="btn-outline px-3"
                  aria-label="Aumentar"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <Field label="Motivo" className="mt-4">
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="input">
                <option value="PURCHASE_ORDER">Entrada de compra</option>
                <option value="RETURN">Devolucao</option>
                <option value="MANUAL_ADJUSTMENT">Ajuste manual</option>
                <option value="LOSS">Perda / avaria</option>
              </select>
            </Field>
          </>
        ) : (
          <Field label="Nova quantidade fisica" className="mt-4">
            <input
              type="number"
              min={0}
              value={absolute}
              onChange={(e) => setAbsolute(Number(e.target.value))}
              className="input"
            />
          </Field>
        )}

        <Field label="Observacao (opcional)" className="mt-4">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input"
            placeholder="NF 12345, contagem do dia..."
          />
        </Field>

        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            invalid ? 'bg-rose-50 dark:bg-rose-950/40 font-medium text-rose-700 dark:text-rose-300' : 'bg-ink-50 dark:bg-ink-925 text-ink-600 dark:text-ink-300'
          }`}
        >
          {invalid
            ? `Recusado: ficariam ${projected} un. com ${row.reserved} ja reservadas em pedidos abertos.`
            : `Depois do ajuste: ${projected} un. no fisico, ${Math.max(0, projected - row.reserved)} disponiveis.`}
        </p>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || invalid || (mode === 'delta' && delta === 0)}
            className="btn-primary flex-1"
          >
            {save.isPending ? <Spinner /> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryDialog({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'movements', row.productId],
    queryFn: () => api.get<{ items: StockMovement[] }>(`/admin/stock/movements?productId=${row.productId}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md animate-slide-in flex-col bg-white dark:bg-ink-900 shadow-2xl">
        <header className="flex items-start justify-between border-b border-ink-100 dark:border-ink-800 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">Historico de estoque</h2>
            <p className="text-sm text-ink-500 dark:text-ink-400">{row.name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <TableSkeleton rows={5} cols={1} />
          ) : (data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">Sem movimentacoes registradas.</p>
          ) : (
            <ol className="space-y-3">
              {data!.items.map((m) => (
                <li key={m.id} className="flex gap-3 rounded-xl border border-ink-100 dark:border-ink-800 p-3">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                      m.delta > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : m.delta < 0
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                          : 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400'
                    }`}
                  >
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                      {STOCK_REASON_LABEL[m.reason] ?? m.reason}
                    </p>
                    {m.note && <p className="text-xs text-ink-500 dark:text-ink-400">{m.note}</p>}
                    <p className="mt-0.5 text-xs text-ink-400">
                      {dateTime(m.createdAt)}
                      {m.actor?.name ? ` · ${m.actor.name}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
