import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, ShoppingBag } from 'lucide-react';
import { api } from '../lib/api';
import { dateTime, money } from '../lib/format';
import type { Order, Paginated } from '../lib/types';
import { useAuth } from '../store/auth';
import { EmptyState, PageHeading, StatusBadge, TableSkeleton } from '../components/ui';

export function AccountPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'mine'],
    queryFn: () => api.get<Paginated<Order>>('/orders?perPage=20'),
  });

  const orders = data?.items ?? [];
  const totalSpent = orders
    .filter((o) => ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(o.status))
    .reduce((sum, o) => sum + o.totalCents, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeading title="Minha conta" subtitle={user?.email} />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pedidos" value={String(data?.total ?? 0)} />
        <StatCard label="Total comprado" value={money(totalSpent)} />
        <StatCard label="Cliente desde" value={user ? dateTime(user.createdAt).split(',')[0] : '—'} />
      </div>

      <h2 className="mb-4 text-base font-bold text-ink-900">Meus pedidos</h2>

      {isLoading ? (
        <TableSkeleton rows={4} cols={1} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-10 w-10" />}
          title="Voce ainda nao fez pedidos"
          message="Quando fizer, o historico completo aparece aqui."
          action={<Link to="/catalogo" className="btn-primary">Ver catalogo</Link>}
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link
                    to={`/pedido/${order.number}`}
                    className="font-mono text-sm font-bold text-ink-900 hover:text-brand-700"
                  >
                    {order.number}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">{dateTime(order.createdAt)}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex -space-x-2">
                  {order.items.slice(0, 4).map((item) => (
                    <img
                      key={item.id}
                      src={item.imageUrl ?? ''}
                      alt=""
                      title={item.name}
                      className="h-11 w-11 rounded-lg border-2 border-white object-cover"
                      decoding="async"
                      loading="lazy"
                    />
                  ))}
                  {order.items.length > 4 && (
                    <span className="grid h-11 w-11 place-items-center rounded-lg border-2 border-white bg-ink-100 text-xs font-bold text-ink-600">
                      +{order.items.length - 4}
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-500">
                  <Package className="mr-1 inline h-3.5 w-3.5" />
                  {order.items.reduce((n, i) => n + i.quantity, 0)} item(ns)
                </p>
                <div className="ml-auto flex items-center gap-4">
                  <span className="text-lg font-bold text-ink-900">{money(order.totalCents)}</span>
                  <Link to={`/pedido/${order.number}`} className="btn-outline text-sm">
                    Detalhes
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
    </div>
  );
}
