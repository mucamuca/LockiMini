import { useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import { ApiError, api, queryString } from '../../lib/api';
import { ORDER_STATUS, PAYMENT_METHOD_LABEL, dateTime, money, relativeTime } from '../../lib/format';
import type { Order, OrderStatus, Paginated } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { EmptyState, PageHeading, Spinner, StatusBadge, TableSkeleton } from '../../components/ui';

const STATUSES: (OrderStatus | 'all')[] = [
  'all',
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

export function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const status = (params.get('status') ?? 'all') as OrderStatus | 'all';

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'orders', { status, search }],
    queryFn: () =>
      api.get<Paginated<Order>>(`/admin/orders${queryString({ status, search, perPage: 50 })}`),
  });

  const orders = data?.items ?? [];

  return (
    <>
      <PageHeading title="Pedidos" subtitle={`${data?.total ?? 0} no filtro atual`} />

      <div className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="Buscar por numero ou e-mail"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (s === 'all') next.delete('status');
                else next.set('status', s);
                setParams(next, { replace: true });
              }}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                status === s ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              {s === 'all' ? 'Todos' : ORDER_STATUS[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState title="Nenhum pedido encontrado" message="Ajuste os filtros para ver outros pedidos." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/70 text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Pedido</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Pagamento</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {orders.map((order) => (
                  <tr key={order.id} className="cursor-pointer hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/pedidos/${order.id}`}
                        className="font-mono text-xs font-semibold text-ink-900 dark:text-ink-50 hover:text-brand-700 dark:hover:text-brand-400"
                      >
                        {order.number}
                      </Link>
                      <p className="text-xs text-ink-400">{relativeTime(order.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{order.email}</td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                      {order.payment ? PAYMENT_METHOD_LABEL[order.payment.method] : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900 dark:text-ink-50">
                      {money(order.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

type AdminOrderDetail = Order & {
  customer: { id: string; name: string; email: string } | null;
  reservations: {
    id: string;
    quantity: number;
    status: string;
    expiresAt: string;
    product: { name: string; sku: string };
  }[];
};

/** Transicoes permitidas — o backend valida de novo, isto so evita cliques inuteis. */
const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'SHIPPED', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export function AdminOrderDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => api.get<{ order: AdminOrderDetail }>(`/admin/orders/${id}`),
  });

  const changeStatus = useMutation({
    mutationFn: (status: OrderStatus) => api.post(`/admin/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      toast.success('Status atualizado');
    },
    onError: (err) =>
      toast.error('Nao foi possivel mudar o status', err instanceof ApiError ? err.message : undefined),
  });

  if (isLoading || !data) {
    return <div className="skeleton h-96" />;
  }

  const order = data.order;
  const address = order.shippingAddress;

  return (
    <>
      <button onClick={() => navigate('/admin/pedidos')} className="btn-ghost mb-4 text-sm">
        <ArrowLeft className="h-4 w-4" /> Voltar aos pedidos
      </button>

      <PageHeading
        title={order.number}
        subtitle={`Criado em ${dateTime(order.createdAt)}`}
        actions={<StatusBadge status={order.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">Itens</h2>
            <ul className="mt-4 divide-y divide-ink-100 dark:divide-ink-800">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <img src={item.imageUrl ?? ''} alt="" className="h-14 w-14 rounded-lg object-cover"
  decoding="async"
  loading="lazy"/>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{item.name}</p>
                    <p className="font-mono text-xs text-ink-400">{item.sku}</p>
                  </div>
                  <span className="text-sm text-ink-500 dark:text-ink-400">
                    {item.quantity} x {money(item.unitPriceCents)}
                  </span>
                  <span className="w-24 text-right text-sm font-bold text-ink-900 dark:text-ink-50">
                    {money(item.totalCents)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-1.5 border-t border-ink-100 dark:border-ink-800 pt-4 text-sm">
              <div className="flex justify-between text-ink-600 dark:text-ink-300">
                <dt>Subtotal</dt>
                <dd>{money(order.subtotalCents)}</dd>
              </div>
              {order.discountCents > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <dt>Desconto</dt>
                  <dd>-{money(order.discountCents)}</dd>
                </div>
              )}
              <div className="flex justify-between text-ink-600 dark:text-ink-300">
                <dt>Frete</dt>
                <dd>{order.shippingCents === 0 ? 'Gratis' : money(order.shippingCents)}</dd>
              </div>
              <div className="flex justify-between pt-2 text-base font-bold text-ink-900 dark:text-ink-50">
                <dt>Total</dt>
                <dd>{money(order.totalCents)}</dd>
              </div>
            </dl>
          </section>

          {order.reservations.length > 0 && (
            <section className="card p-6">
              <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">Reservas de estoque</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                Unidades separadas para este pedido. Enquanto estao ativas, ninguem mais consegue compra-las.
              </p>
              <ul className="mt-4 space-y-2">
                {order.reservations.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-ink-100 dark:border-ink-800 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink-900 dark:text-ink-50">{r.product.name}</p>
                      <p className="font-mono text-xs text-ink-400">{r.product.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-ink-900 dark:text-ink-50">{r.quantity} un.</p>
                      <p className="text-xs text-ink-400">
                        {r.status === 'ACTIVE'
                          ? `expira ${relativeTime(r.expiresAt)}`
                          : r.status === 'CONSUMED'
                            ? 'baixada'
                            : 'liberada'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="card p-5">
            <h2 className="text-sm font-bold text-ink-900 dark:text-ink-50">Mudar status</h2>
            {NEXT_STATUS[order.status].length === 0 ? (
              <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
                Este pedido chegou a um estado final e nao aceita novas transicoes.
              </p>
            ) : (
              <div className="mt-3 grid gap-2">
                {NEXT_STATUS[order.status].map((next) => (
                  <button
                    key={next}
                    onClick={() => {
                      const destructive = next === 'CANCELLED' || next === 'REFUNDED';
                      if (
                        destructive &&
                        !confirm(
                          `Confirmar "${ORDER_STATUS[next].label}"? As unidades voltam para o estoque.`,
                        )
                      ) {
                        return;
                      }
                      changeStatus.mutate(next);
                    }}
                    disabled={changeStatus.isPending}
                    className={
                      next === 'CANCELLED' || next === 'REFUNDED' ? 'btn-outline text-rose-600 dark:text-rose-400' : 'btn-primary'
                    }
                  >
                    {changeStatus.isPending ? <Spinner /> : ORDER_STATUS[next].label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-bold text-ink-900 dark:text-ink-50">Cliente</h2>
            <p className="mt-3 text-sm font-medium text-ink-900 dark:text-ink-50">
              {order.customer?.name ?? 'Compra sem cadastro'}
            </p>
            <p className="text-sm text-ink-500 dark:text-ink-400">{order.email}</p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-bold text-ink-900 dark:text-ink-50">Pagamento</h2>
            {order.payment ? (
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500 dark:text-ink-400">Metodo</dt>
                  <dd className="font-medium text-ink-900 dark:text-ink-50">
                    {PAYMENT_METHOD_LABEL[order.payment.method]}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500 dark:text-ink-400">Provedor</dt>
                  <dd className="font-medium text-ink-900 dark:text-ink-50">{order.payment.provider}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500 dark:text-ink-400">Situacao</dt>
                  <dd className="font-medium text-ink-900 dark:text-ink-50">{order.payment.status}</dd>
                </div>
                {order.payment.failureCode && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500 dark:text-ink-400">Motivo</dt>
                    <dd className="font-medium text-rose-600 dark:text-rose-400">{order.payment.failureCode}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">Sem registro de pagamento.</p>
            )}
          </div>

          {address && (
            <div className="card p-5">
              <h2 className="text-sm font-bold text-ink-900 dark:text-ink-50">Entrega</h2>
              <address className="mt-3 text-sm not-italic leading-relaxed text-ink-600 dark:text-ink-300">
                <strong className="block text-ink-900 dark:text-ink-50">{address.recipient}</strong>
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}
                <br />
                {address.district} — {address.city}/{address.state}
                <br />
                CEP {address.postalCode}
                {address.phone && (
                  <>
                    <br />
                    {address.phone}
                  </>
                )}
              </address>
            </div>
          )}

          {order.notes && (
            <div className="card p-5">
              <h2 className="text-sm font-bold text-ink-900 dark:text-ink-50">Observacoes</h2>
              <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{order.notes}</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
