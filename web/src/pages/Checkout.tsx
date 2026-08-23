import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Barcode, CreditCard, Lock, QrCode, ShieldCheck, Tag, X } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { installmentLabel, maskCardNumber, maskPostalCode, money } from '../lib/format';
import type { Order, PaymentMethod, User } from '../lib/types';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../store/auth';
import { useToast } from '../components/Toast';
import { Field, Spinner } from '../components/ui';

type PaymentMethodsInfo = {
  provider: string;
  methods: PaymentMethod[];
  testCards: { number: string; result: string }[];
  reservationTtlMinutes: number;
};

const METHOD_META: Record<PaymentMethod, { label: string; hint: string; icon: typeof CreditCard }> = {
  credit_card: { label: 'Cartao de credito', hint: 'Aprovacao imediata', icon: CreditCard },
  pix: { label: 'Pix', hint: 'Aprovacao em segundos', icon: QrCode },
  boleto: { label: 'Boleto', hint: 'Compensa em ate 2 dias uteis', icon: Barcode },
};

export function CheckoutPage() {
  const { cart, loading } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<PaymentMethod>('credit_card');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [installments, setInstallments] = useState(1);

  const [form, setForm] = useState({
    email: '',
    recipient: '',
    postalCode: '',
    line1: '',
    line2: '',
    district: '',
    city: '',
    state: '',
    phone: '',
    cardNumber: '',
    cardHolder: '',
    cardExp: '',
    cardCvv: '',
    notes: '',
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const paymentInfo = useQuery({
    queryKey: ['checkout', 'payment-methods'],
    queryFn: () => api.get<PaymentMethodsInfo>('/checkout/payment-methods'),
  });

  // Preenche o formulario com a conta e o endereco padrao de quem esta logado.
  const profile = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: () => api.get<{ user: User }>('/auth/me'),
    enabled: Boolean(user),
  });

  useEffect(() => {
    const me = profile.data?.user;
    if (!me) return;
    const address = me.addresses?.find((a) => a.isDefault) ?? me.addresses?.[0];
    setForm((f) => ({
      ...f,
      email: f.email || me.email,
      recipient: f.recipient || address?.recipient || me.name,
      postalCode: f.postalCode || address?.postalCode || '',
      line1: f.line1 || address?.line1 || '',
      line2: f.line2 || address?.line2 || '',
      district: f.district || address?.district || '',
      city: f.city || address?.city || '',
      state: f.state || address?.state || '',
      phone: f.phone || address?.phone || '',
    }));
  }, [profile.data]);

  const applyCoupon = useMutation({
    mutationFn: (code: string) =>
      api.post<{ code: string; discountCents: number }>('/checkout/coupon/preview', { code }),
    onSuccess: (res) => {
      setAppliedCoupon({ code: res.code, discountCents: res.discountCents });
      toast.success('Cupom aplicado', `Desconto de ${money(res.discountCents)}.`);
    },
    onError: (err) =>
      toast.error('Cupom nao aplicado', err instanceof ApiError ? err.message : 'Tente outro codigo.'),
  });

  const submit = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ order: Order; paymentStatus: string; failureMessage: string | null }>('/checkout', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      // O e-mail vai pelo state da rota, nao pela URL: quem comprou sem conta
      // ve o pedido na hora, e o endereco continua seguro de compartilhar.
      navigate(`/pedido/${res.order.number}`, { state: { email: res.order.email } });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(
          err.code === 'insufficient_stock' ? 'Estoque acabou' : 'Nao foi possivel finalizar',
          err.message,
        );
        if (err.code === 'insufficient_stock' || err.code === 'cart_needs_review') {
          queryClient.invalidateQueries({ queryKey: ['cart'] });
          navigate('/carrinho');
        }
      } else {
        toast.error('Nao foi possivel finalizar', 'Tente novamente em instantes.');
      }
    },
  });

  function validate() {
    const next: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) next.email = 'Informe um e-mail valido.';
    if (form.recipient.trim().length < 2) next.recipient = 'Informe o nome de quem recebe.';
    if (!/^\d{5}-?\d{3}$/.test(form.postalCode)) next.postalCode = 'CEP no formato 00000-000.';
    if (form.line1.trim().length < 3) next.line1 = 'Informe rua e numero.';
    if (form.district.trim().length < 2) next.district = 'Informe o bairro.';
    if (form.city.trim().length < 2) next.city = 'Informe a cidade.';
    if (form.state.trim().length !== 2) next.state = 'Use a sigla (ex.: SP).';

    if (method === 'credit_card') {
      const digits = form.cardNumber.replace(/\D/g, '');
      if (digits.length < 13) next.cardNumber = 'Numero de cartao incompleto.';
      if (form.cardHolder.trim().length < 2) next.cardHolder = 'Informe o nome impresso no cartao.';
      if (!/^\d{2}\/\d{2,4}$/.test(form.cardExp)) next.cardExp = 'Use MM/AA.';
      if (!/^\d{3,4}$/.test(form.cardCvv)) next.cardCvv = 'CVV invalido.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) {
      toast.error('Revise os campos', 'Alguns dados precisam de ajuste.');
      return;
    }

    const [expMonth, expYearRaw] = form.cardExp.split('/');
    const expYear = expYearRaw?.length === 2 ? `20${expYearRaw}` : expYearRaw;

    submit.mutate({
      email: form.email.trim(),
      shippingAddress: {
        recipient: form.recipient.trim(),
        line1: form.line1.trim(),
        line2: form.line2.trim() || undefined,
        district: form.district.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        postalCode: form.postalCode,
        phone: form.phone.trim() || undefined,
      },
      paymentMethod: method,
      couponCode: appliedCoupon?.code,
      notes: form.notes.trim() || undefined,
      card:
        method === 'credit_card'
          ? {
              number: form.cardNumber.replace(/\D/g, ''),
              holder: form.cardHolder.trim().toUpperCase(),
              expMonth: Number(expMonth),
              expYear: Number(expYear),
              cvv: form.cardCvv,
              installments,
            }
          : undefined,
    });
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-16"><div className="skeleton h-96" /></div>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-ink-900">Carrinho vazio</h1>
        <p className="mt-2 text-ink-500">Adicione produtos antes de finalizar a compra.</p>
        <Link to="/catalogo" className="btn-primary mt-6">Ver catalogo</Link>
      </div>
    );
  }

  const discountCents = appliedCoupon?.discountCents ?? 0;
  const totalCents = Math.max(0, cart.subtotalCents - discountCents) + cart.shippingCents;
  const availableMethods = paymentInfo.data?.methods ?? ['credit_card', 'pix', 'boleto'];

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Finalizar compra</h1>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-500">
        <Lock className="h-3.5 w-3.5" /> Ambiente de demonstracao — nenhuma cobranca real e feita.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900">1. Contato</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="E-mail" error={errors.email} className="sm:col-span-2">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  className={`input ${errors.email ? 'input-error' : ''}`}
                  placeholder="voce@email.com"
                  autoComplete="email"
                />
              </Field>
              <Field label="Telefone (opcional)">
                <input
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  className="input"
                  placeholder="(11) 90000-0000"
                  autoComplete="tel"
                />
              </Field>
            </div>
            {!user && (
              <p className="mt-3 text-xs text-ink-500">
                Ja tem conta?{' '}
                <Link to="/entrar" className="font-semibold text-brand-600 hover:underline">
                  Entre
                </Link>{' '}
                para acompanhar seus pedidos.
              </p>
            )}
          </section>

          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900">2. Entrega</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-6">
              <Field label="Quem recebe" error={errors.recipient} className="sm:col-span-4">
                <input
                  value={form.recipient}
                  onChange={(e) => set('recipient', e.target.value)}
                  className={`input ${errors.recipient ? 'input-error' : ''}`}
                  autoComplete="name"
                />
              </Field>
              <Field label="CEP" error={errors.postalCode} className="sm:col-span-2">
                <input
                  value={form.postalCode}
                  onChange={(e) => set('postalCode', maskPostalCode(e.target.value))}
                  className={`input ${errors.postalCode ? 'input-error' : ''}`}
                  placeholder="00000-000"
                  inputMode="numeric"
                  autoComplete="postal-code"
                />
              </Field>
              <Field label="Endereco" error={errors.line1} className="sm:col-span-4">
                <input
                  value={form.line1}
                  onChange={(e) => set('line1', e.target.value)}
                  className={`input ${errors.line1 ? 'input-error' : ''}`}
                  placeholder="Rua, numero"
                  autoComplete="address-line1"
                />
              </Field>
              <Field label="Complemento" className="sm:col-span-2">
                <input
                  value={form.line2}
                  onChange={(e) => set('line2', e.target.value)}
                  className="input"
                  placeholder="Apto, bloco"
                />
              </Field>
              <Field label="Bairro" error={errors.district} className="sm:col-span-2">
                <input
                  value={form.district}
                  onChange={(e) => set('district', e.target.value)}
                  className={`input ${errors.district ? 'input-error' : ''}`}
                />
              </Field>
              <Field label="Cidade" error={errors.city} className="sm:col-span-3">
                <input
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  className={`input ${errors.city ? 'input-error' : ''}`}
                  autoComplete="address-level2"
                />
              </Field>
              <Field label="UF" error={errors.state} className="sm:col-span-1">
                <input
                  value={form.state}
                  onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))}
                  className={`input ${errors.state ? 'input-error' : ''}`}
                  placeholder="SP"
                  maxLength={2}
                />
              </Field>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900">3. Pagamento</h2>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {availableMethods.map((m) => {
                const meta = METHOD_META[m];
                const active = method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      active
                        ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600'
                        : 'border-ink-200 hover:border-ink-300'
                    }`}
                  >
                    <meta.icon className={`mt-0.5 h-5 w-5 ${active ? 'text-brand-600' : 'text-ink-400'}`} />
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">{meta.label}</span>
                      <span className="block text-xs text-ink-500">{meta.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {method === 'credit_card' && (
              <div className="mt-5 grid gap-4 sm:grid-cols-6">
                <Field label="Numero do cartao" error={errors.cardNumber} className="sm:col-span-6">
                  <input
                    value={form.cardNumber}
                    onChange={(e) => set('cardNumber', maskCardNumber(e.target.value))}
                    className={`input font-mono ${errors.cardNumber ? 'input-error' : ''}`}
                    placeholder="4242 4242 4242 4242"
                    inputMode="numeric"
                    autoComplete="cc-number"
                  />
                </Field>
                <Field label="Nome no cartao" error={errors.cardHolder} className="sm:col-span-6">
                  <input
                    value={form.cardHolder}
                    onChange={(e) => set('cardHolder', e.target.value)}
                    className={`input uppercase ${errors.cardHolder ? 'input-error' : ''}`}
                    placeholder="COMO ESTA IMPRESSO"
                    autoComplete="cc-name"
                  />
                </Field>
                <Field label="Validade" error={errors.cardExp} className="sm:col-span-2">
                  <input
                    value={form.cardExp}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                      set('cardExp', digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
                    }}
                    className={`input ${errors.cardExp ? 'input-error' : ''}`}
                    placeholder="MM/AA"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                  />
                </Field>
                <Field label="CVV" error={errors.cardCvv} className="sm:col-span-2">
                  <input
                    value={form.cardCvv}
                    onChange={(e) => set('cardCvv', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className={`input ${errors.cardCvv ? 'input-error' : ''}`}
                    placeholder="123"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                  />
                </Field>
                <Field label="Parcelas" className="sm:col-span-2">
                  <select
                    value={installments}
                    onChange={(e) => setInstallments(Number(e.target.value))}
                    className="input"
                  >
                    {[1, 2, 3, 6, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {installmentLabel(totalCents, n)}
                      </option>
                    ))}
                  </select>
                </Field>

                {(paymentInfo.data?.testCards.length ?? 0) > 0 && (
                  <div className="rounded-xl bg-ink-50 p-3.5 text-xs sm:col-span-6">
                    <p className="font-semibold text-ink-700">Cartoes de teste</p>
                    <ul className="mt-1.5 space-y-0.5 text-ink-500">
                      {paymentInfo.data!.testCards.map((c) => (
                        <li key={c.number}>
                          <button
                            type="button"
                            onClick={() => set('cardNumber', c.number)}
                            className="font-mono text-brand-600 hover:underline"
                          >
                            {c.number}
                          </button>{' '}
                          — {c.result}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {method !== 'credit_card' && (
              <p className="mt-5 rounded-xl bg-ink-50 p-4 text-sm text-ink-600">
                {method === 'pix'
                  ? 'Ao confirmar, geramos o codigo Pix na proxima tela.'
                  : 'Ao confirmar, o boleto e gerado na proxima tela.'}{' '}
                As unidades ficam reservadas para voce por{' '}
                <strong className="text-ink-900">{paymentInfo.data?.reservationTtlMinutes ?? 20} minutos</strong>.
              </p>
            )}
          </section>

          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900">4. Observacoes (opcional)</h2>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className="input mt-3 resize-none"
              placeholder="Ponto de referencia, instrucoes de entrega..."
            />
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5">
            <h2 className="text-base font-bold text-ink-900">Resumo do pedido</h2>

            <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto scroll-slim pr-1">
              {cart.items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <div className="relative shrink-0">
                    <img src={item.imageUrl ?? ''} alt="" className="h-14 w-14 rounded-lg object-cover"
  decoding="async"
  loading="lazy"/>
                    <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink-900 px-1 text-[11px] font-bold text-white">
                      {item.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-ink-900">{item.name}</p>
                    <p className="text-xs text-ink-500">{money(item.unitPriceCents)}</p>
                  </div>
                  <span className="text-sm font-semibold text-ink-900">{money(item.totalCents)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-ink-100 pt-4">
              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                    <Tag className="h-3.5 w-3.5" /> {appliedCoupon.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCoupon('');
                    }}
                    className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                    aria-label="Remover cupom"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    className="input"
                    placeholder="Cupom de desconto"
                  />
                  <button
                    type="button"
                    onClick={() => coupon && applyCoupon.mutate(coupon)}
                    disabled={!coupon || applyCoupon.isPending}
                    className="btn-outline shrink-0"
                  >
                    {applyCoupon.isPending ? <Spinner /> : 'Aplicar'}
                  </button>
                </div>
              )}
            </div>

            <dl className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between text-ink-600">
                <dt>Subtotal</dt>
                <dd>{money(cart.subtotalCents)}</dd>
              </div>
              {discountCents > 0 && (
                <div className="flex justify-between font-medium text-emerald-600">
                  <dt>Desconto</dt>
                  <dd>-{money(discountCents)}</dd>
                </div>
              )}
              <div className="flex justify-between text-ink-600">
                <dt>Frete</dt>
                <dd>{cart.shippingCents === 0 ? 'Gratis' : money(cart.shippingCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-100 pt-3 text-lg font-bold text-ink-900">
                <dt>Total</dt>
                <dd>{money(totalCents)}</dd>
              </div>
            </dl>

            <button type="submit" className="btn-brand mt-5 h-12 w-full text-base" disabled={submit.isPending}>
              {submit.isPending ? (
                <>
                  <Spinner className="h-5 w-5" /> Processando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> Pagar {money(totalCents)}
                </>
              )}
            </button>

            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-ink-400">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
              Suas unidades sao reservadas assim que o pedido e criado, entao ninguem compra na sua frente
              enquanto o pagamento e processado.
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}
