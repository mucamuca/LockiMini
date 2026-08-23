import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Copy,
  Package,
  QrCode,
  Receipt,
  Truck,
  XCircle,
} from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { PAYMENT_METHOD_LABEL, dateTime, money } from '../lib/format';
import type { Order, OrderStatus } from '../lib/types';
import { useAuth } from '../store/auth';
import { useToast } from '../components/Toast';
import { EmptyState, Spinner, StatusBadge } from '../components/ui';

const TIMELINE: { status: OrderStatus; label: string; icon: typeof Package }[] = [
  { status: 'PENDING_PAYMENT', label: 'Pedido criado', icon: Receipt },
  { status: 'PAID', label: 'Pagamento aprovado', icon: CheckCircle2 },
  { status: 'PROCESSING', label: 'Em separacao', icon: Package },
  { status: 'SHIPPED', label: 'Enviado', icon: Truck },
  { status: 'DELIVERED', label: 'Entregue', icon: CheckCircle2 },
];

export function OrderDetailPage() {
  const { number = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Quem acabou de comprar (ou veio do rastreio) chega com o e-mail no state da
  // rota — nunca na URL, que seria compartilhavel e ficaria em historico/log.
  const stateEmail = (useLocation().state as { email?: string } | null)?.email ?? '';
  const [guestEmail, setGuestEmail] = useState(stateEmail);
  const [submittedEmail, setSubmittedEmail] = useState(stateEmail);

  const { data, isLoading, error } = useQuery({
    queryKey: ['order', number, submittedEmail],
    queryFn: () =>
      api.get<{ order: Order }>(
        `/orders/${number}${submittedEmail ? `?email=${encodeURIComponent(submittedEmail)}` : ''}`,
      ),
    retry: false,
    // Pix e boleto sao confirmados de forma assincrona: enquanto o pedido
    // estiver aguardando, reconsultamos sozinhos.
    refetchInterval: (query) =>
      query.state.data?.order.status === 'PENDING_PAYMENT' ? 5000 : false,
  });

  const simulate = useMutation({
    mutationFn: (outcome: 'paid' | 'failed') =>
      api.post(`/orders/${number}/simulate-payment`, { outcome }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', number] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      toast.success('Pagamento atualizado', 'O status do pedido foi recalculado.');
    },
    onError: (err) =>
      toast.error('Nao foi possivel simular', err instanceof ApiError ? err.message : 'Tente de novo.'),
  });

  const cancel = useMutation({
    mutationFn: (orderId: string) => api.post(`/orders/${orderId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', number] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      toast.success('Pedido cancelado', 'As unidades voltaram para o estoque.');
    },
    onError: (err) =>
      toast.error('Nao foi possivel cancelar', err instanceof ApiError ? err.message : 'Tente de novo.'),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-4 py-16"><div className="skeleton h-96" /></div>;
  }

  // Visitante sem sessao precisa confirmar o e-mail da compra.
  if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="card p-6">
          <h1 className="text-lg font-bold text-ink-900">Confirme seu e-mail</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Informe o e-mail usado na compra para ver o pedido <strong>{number}</strong>.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedEmail(guestEmail.trim());
            }}
            className="mt-5 space-y-3"
          >
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="input"
              placeholder="voce@email.com"
              required
            />
            <button type="submit" className="btn-primary w-full">Ver pedido</button>
          </form>
          {!user && (
            <p className="mt-4 text-center text-xs text-ink-500">
              Ou <Link to="/entrar" className="font-semibold text-brand-600 hover:underline">entre na sua conta</Link>.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <EmptyState
          title="Pedido nao encontrado"
          message={`Nao encontramos nenhum pedido com o numero ${number}.`}
          action={<Link to="/" className="btn-primary">Voltar a loja</Link>}
        />
      </div>
    );
  }

  const order = data.order;
  const payment = order.payment;
  const payload = (payment?.payload ?? {}) as Record<string, string>;
  const failed = order.status === 'CANCELLED' || payment?.status === 'FAILED';
  const awaiting = order.status === 'PENDING_PAYMENT';

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado', label);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div
        className={`rounded-2xl p-6 ${
          failed ? 'bg-rose-50 ring-1 ring-rose-200' : awaiting ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-emerald-50 ring-1 ring-emerald-200'
        }`}
      >
        <div className="flex items-start gap-4">
          {failed ? (
            <XCircle className="h-8 w-8 shrink-0 text-rose-600" />
          ) : awaiting ? (
            <QrCode className="h-8 w-8 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">
              {failed
                ? 'Pagamento nao aprovado'
                : awaiting
                  ? 'Aguardando o pagamento'
                  : 'Pedido confirmado!'}
            </h1>
            <p className="mt-1 text-sm text-ink-600">
              {failed
                ? order.notes ?? 'O emissor recusou a cobranca. As unidades voltaram para o estoque.'
                : awaiting
                  ? 'Assim que o pagamento cair, o pedido segue para separacao automaticamente.'
                  : 'Enviamos a confirmacao para ' + order.email + '.'}
            </p>
            <p className="mt-3 font-mono text-sm font-semibold text-ink-900">{order.number}</p>
          </div>
        </div>
      </div>

      {awaiting && payload.method === 'pix' && (
        <section className="card mt-6 p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <QrCode className="h-5 w-5" /> Pague com Pix
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">{payload.instructions}</p>
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 bg-ink-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Pix copia e cola</p>
            <p className="mt-1.5 break-all font-mono text-xs text-ink-700">{payload.copyPaste}</p>
            <button
              onClick={() => copy(payload.copyPaste, 'Codigo Pix na area de transferencia.')}
              className="btn-outline mt-3"
            >
              <Copy className="h-4 w-4" /> Copiar codigo
            </button>
          </div>
        </section>
      )}

      {awaiting && payload.method === 'boleto' && (
        <section className="card mt-6 p-6">
          <h2 className="text-base font-bold text-ink-900">Boleto bancario</h2>
          <p className="mt-1.5 text-sm text-ink-500">{payload.instructions}</p>
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 bg-ink-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Linha digitavel</p>
            <p className="mt-1.5 font-mono text-sm text-ink-800">{payload.digitableLine}</p>
            <button
              onClick={() => copy(payload.digitableLine, 'Linha digitavel copiada.')}
              className="btn-outline mt-3"
            >
              <Copy className="h-4 w-4" /> Copiar linha
            </button>
          </div>
        </section>
      )}

      {awaiting && payment?.provider === 'mock' && (
        <section className="mt-4 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 p-4">
          <p className="text-sm font-semibold text-brand-900">Simulador do gateway de testes</p>
          <p className="mt-1 text-sm text-brand-800">
            Em producao quem confirma este pagamento e o webhook do provedor. Aqui voce pode disparar o
            desfecho manualmente para ver o estoque reagir.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => simulate.mutate('paid')}
              disabled={simulate.isPending}
              className="btn-brand"
            >
              {simulate.isPending ? <Spinner /> : 'Confirmar pagamento'}
            </button>
            <button
              onClick={() => simulate.mutate('failed')}
              disabled={simulate.isPending}
              className="btn-outline"
            >
              Simular recusa
            </button>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900">Acompanhamento</h2>
            <ol className="mt-5 space-y-0">
              {TIMELINE.map((step, i) => {
                const currentIndex = TIMELINE.findIndex((s) => s.status === order.status);
                const done = currentIndex >= 0 && i <= currentIndex;
                const isCancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
                return (
                  <li key={step.status} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`grid h-8 w-8 place-items-center rounded-full ${
                          isCancelled
                            ? 'bg-ink-100 text-ink-400'
                            : done
                              ? 'bg-emerald-500 text-white'
                              : 'bg-ink-100 text-ink-400'
                        }`}
                      >
                        <step.icon className="h-4 w-4" />
                      </div>
                      {i < TIMELINE.length - 1 && (
                        <div className={`h-8 w-px ${done && !isCancelled ? 'bg-emerald-300' : 'bg-ink-200'}`} />
                      )}
                    </div>
                    <div className="pb-8">
                      <p className={`text-sm font-semibold ${done && !isCancelled ? 'text-ink-900' : 'text-ink-400'}`}>
                        {step.label}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {(order.status === 'CANCELLED' || order.status === 'REFUNDED') && (
              <p className="rounded-lg bg-ink-100 px-3 py-2 text-sm font-medium text-ink-600">
                Este pedido foi {order.status === 'REFUNDED' ? 'estornado' : 'cancelado'}.
              </p>
            )}
          </section>

          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900">Itens</h2>
            <ul className="mt-4 divide-y divide-ink-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                  <img src={item.imageUrl ?? ''} alt="" className="h-16 w-16 rounded-lg object-cover"
  decoding="async"
  loading="lazy"/>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{item.name}</p>
                    <p className="text-xs text-ink-500">
                      {item.quantity} x {money(item.unitPriceCents)} · SKU {item.sku}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-ink-900">{money(item.totalCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink-900">Status</h2>
              <StatusBadge status={order.status} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Data" value={dateTime(order.createdAt)} />
              <Row label="Pagamento" value={payment ? PAYMENT_METHOD_LABEL[payment.method] : '—'} />
              <Row label="Subtotal" value={money(order.subtotalCents)} />
              {order.discountCents > 0 && (
                <Row label="Desconto" value={`-${money(order.discountCents)}`} />
              )}
              <Row label="Frete" value={order.shippingCents === 0 ? 'Gratis' : money(order.shippingCents)} />
              <div className="flex justify-between border-t border-ink-100 pt-3 text-base font-bold text-ink-900">
                <dt>Total</dt>
                <dd>{money(order.totalCents)}</dd>
              </div>
            </dl>

            {awaiting && user && (
              <button
                onClick={() => cancel.mutate(order.id)}
                disabled={cancel.isPending}
                className="btn-outline mt-4 w-full text-rose-600"
              >
                {cancel.isPending ? <Spinner /> : 'Cancelar pedido'}
              </button>
            )}
          </div>

          {order.shippingAddress && (
            <div className="card p-5">
              <h2 className="text-sm font-bold text-ink-900">Entrega</h2>
              <address className="mt-3 text-sm not-italic leading-relaxed text-ink-600">
                <strong className="block text-ink-900">{order.shippingAddress.recipient}</strong>
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
                <br />
                {order.shippingAddress.district} — {order.shippingAddress.city}/{order.shippingAddress.state}
                <br />
                CEP {order.shippingAddress.postalCode}
                {order.shippingAddress.phone && (
                  <>
                    <br />
                    {order.shippingAddress.phone}
                  </>
                )}
              </address>
            </div>
          )}

          <Link to="/catalogo" className="btn-outline w-full">Continuar comprando</Link>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-600">
      <dt>{label}</dt>
      <dd className="font-medium text-ink-900">{value}</dd>
    </div>
  );
}
