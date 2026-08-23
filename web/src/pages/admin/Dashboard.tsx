import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Package,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { dateOnly, money, relativeTime } from '../../lib/format';
import type { DashboardData } from '../../lib/types';
import { BarChart, PageHeading, StatusBadge } from '../../components/ui';

const RANGES = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

export function AdminDashboard() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard', days],
    queryFn: () => api.get<DashboardData>(`/admin/dashboard?days=${days}`),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-9 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
        <div className="skeleton h-72" />
      </div>
    );
  }

  const { kpis } = data;

  return (
    <>
      <PageHeading
        title="Visao geral"
        subtitle={`Desempenho dos ultimos ${days} dias`}
        actions={
          <div className="flex rounded-xl border border-ink-200 bg-white p-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  days === r.days ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Receita"
          value={money(kpis.revenueCents)}
          change={kpis.revenueChangePercent}
          icon={TrendingUp}
        />
        <Kpi label="Pedidos" value={String(kpis.orders)} icon={Receipt} hint={`${kpis.unitsSold} unidades vendidas`} />
        <Kpi label="Ticket medio" value={money(kpis.averageTicketCents)} icon={Package} />
        <Kpi label="Clientes" value={String(kpis.customers)} icon={Users} hint="cadastrados na base" />
      </div>

      {(kpis.pendingPayment > 0 || kpis.toShip > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {kpis.pendingPayment > 0 && (
            <Link
              to="/admin/pedidos?status=PENDING_PAYMENT"
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-900">
                <strong>{kpis.pendingPayment}</strong> pedido(s) aguardando pagamento.
              </p>
            </Link>
          )}
          {kpis.toShip > 0 && (
            <Link
              to="/admin/pedidos?status=PAID"
              className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 transition hover:border-sky-300"
            >
              <Package className="h-5 w-5 shrink-0 text-sky-600" />
              <p className="text-sm text-sky-900">
                <strong>{kpis.toShip}</strong> pedido(s) prontos para separar e enviar.
              </p>
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card p-6 xl:col-span-2">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-ink-900">Receita por dia</h2>
            <span className="text-sm text-ink-500">{money(kpis.revenueCents)} no periodo</span>
          </div>
          <BarChart
            data={data.salesSeries.map((d) => ({ label: dateOnly(d.date), value: d.revenueCents }))}
            formatValue={money}
          />
          <div className="mt-2 flex justify-between text-xs text-ink-400">
            <span>{data.salesSeries[0] && dateOnly(data.salesSeries[0].date)}</span>
            <span>{data.salesSeries.at(-1) && dateOnly(data.salesSeries.at(-1)!.date)}</span>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-base font-bold text-ink-900">Estoque em alerta</h2>
          {data.lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">Nenhum produto abaixo do minimo. Tudo certo.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.lowStock.map((item) => (
                <li key={item.productId} className="flex items-center gap-3">
                  <img src={item.imageUrl ?? ''} alt="" className="h-10 w-10 rounded-lg object-cover"
  decoding="async"
  loading="lazy"/>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{item.name}</p>
                    <p className="text-xs text-ink-500">
                      {item.reserved > 0 ? `${item.reserved} reservada(s) · ` : ''}minimo {item.threshold}
                    </p>
                  </div>
                  <span
                    className={`chip ${
                      item.available <= 0
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                        : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    }`}
                  >
                    {item.available} un.
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/admin/estoque" className="btn-outline mt-5 w-full text-sm">
            Gerenciar estoque
          </Link>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card p-6 xl:col-span-2">
          <h2 className="mb-4 text-base font-bold text-ink-900">Pedidos recentes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="pb-2 font-semibold">Pedido</th>
                  <th className="pb-2 font-semibold">Cliente</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {data.recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-ink-50/60">
                    <td className="py-3">
                      <Link
                        to={`/admin/pedidos/${order.id}`}
                        className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-700"
                      >
                        {order.number}
                      </Link>
                      <p className="text-xs text-ink-400">{relativeTime(order.createdAt)}</p>
                    </td>
                    <td className="py-3 text-ink-600">{order.email}</td>
                    <td className="py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="py-3 text-right font-semibold text-ink-900">
                      {money(order.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-4 text-base font-bold text-ink-900">Mais vendidos</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-ink-500">Sem vendas no periodo.</p>
          ) : (
            <ol className="space-y-3">
              {data.topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-ink-100 text-xs font-bold text-ink-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                    <p className="text-xs text-ink-500">{p.units} un. vendidas</p>
                  </div>
                  <span className="text-sm font-semibold text-ink-900">{money(p.revenueCents)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  change,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  change?: number | null;
  hint?: string;
  icon: typeof TrendingUp;
}) {
  const positive = (change ?? 0) >= 0;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
        <Icon className="h-4 w-4 text-ink-300" />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
      {change !== null && change !== undefined ? (
        <p
          className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${
            positive ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(change)}% vs. periodo anterior
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      )}
    </div>
  );
}
