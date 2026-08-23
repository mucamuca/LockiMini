#!/usr/bin/env node
/**
 * Verificacao ponta a ponta contra a API rodando.
 *
 *   npm run dev        (em outro terminal)
 *   npm run smoke
 *
 * Cobre o que costuma quebrar silenciosamente numa loja: preco recalculado no
 * servidor, baixa de estoque so depois do pagamento, devolucao das unidades
 * quando o cartao e recusado e — o mais importante — ausencia de venda alem do
 * estoque quando varias pessoas disputam a ultima unidade.
 */

const API = process.env.API_URL ?? 'http://localhost:4000/api';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  FALHA ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** Cada sessao tem seu proprio pote de cookies: carrinhos nao se misturam. */
function session() {
  const jar = new Map();
  const absorb = (res) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  return async function call(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(jar.size > 0 ? { cookie: cookie() } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    absorb(res);
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body: json };
  };
}

const ADDRESS = {
  recipient: 'Comprador Teste',
  line1: 'Av. Paulista, 1000',
  district: 'Bela Vista',
  city: 'Sao Paulo',
  state: 'SP',
  postalCode: '01310-100',
};

const APPROVED_CARD = {
  number: '4242424242424242',
  holder: 'COMPRADOR TESTE',
  expMonth: 12,
  expYear: new Date().getFullYear() + 3,
  cvv: '123',
};

const availableOf = async (slug) => {
  const res = await fetch(`${API}/catalog/products/${slug}`);
  const { product } = await res.json();
  return { id: product.id, name: product.name, available: product.stock.available, priceCents: product.priceCents };
};

async function main() {
  console.log(`Verificando ${API}`);

  const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error('\nAPI nao respondeu. Suba o servidor com "npm run dev" antes de rodar o smoke.');
    process.exit(1);
  }

  // --- Catalogo ------------------------------------------------------------
  section('Catalogo');
  const list = await fetch(`${API}/catalog/products?perPage=5`).then((r) => r.json());
  check('lista produtos', list.items.length > 0, `${list.total} no catalogo`);
  check('todo produto traz estoque', list.items.every((p) => typeof p.stock.available === 'number'));

  // --- Compra aprovada -----------------------------------------------------
  section('Compra com cartao aprovado');
  const target = await availableOf(list.items.find((p) => p.stock.available >= 2).slug);
  const buyer = session();

  await buyer('/cart/items', { method: 'POST', body: { productId: target.id, quantity: 2 } });
  const cart = await buyer('/cart');
  check('carrinho soma o subtotal', cart.body.cart.subtotalCents === target.priceCents * 2);

  const order = await buyer('/checkout', {
    method: 'POST',
    body: {
      email: 'smoke@teste.dev',
      shippingAddress: ADDRESS,
      paymentMethod: 'credit_card',
      card: APPROVED_CARD,
    },
  });
  check('pedido criado', order.status === 201, order.body?.order?.number);
  check('pedido fica PAID', order.body?.order?.status === 'PAID');

  const afterPaid = await availableOf(list.items.find((p) => p.id === target.id)?.slug ?? '');
  check('estoque caiu 2 un.', afterPaid.available === target.available - 2, `${target.available} -> ${afterPaid.available}`);

  // --- Compra recusada -----------------------------------------------------
  section('Compra com cartao recusado');
  const declined = session();
  await declined('/cart/items', { method: 'POST', body: { productId: target.id, quantity: 1 } });
  const failedOrder = await declined('/checkout', {
    method: 'POST',
    body: {
      email: 'recusado@teste.dev',
      shippingAddress: ADDRESS,
      paymentMethod: 'credit_card',
      card: { ...APPROVED_CARD, number: '4000000000000002' },
    },
  });
  check('pedido recusado fica CANCELLED', failedOrder.body?.order?.status === 'CANCELLED');
  check('motivo da recusa e exposto', failedOrder.body?.order?.payment?.failureCode === 'card_declined');

  const afterDeclined = await availableOf(list.items.find((p) => p.id === target.id)?.slug ?? '');
  check(
    'estoque nao muda em compra recusada',
    afterDeclined.available === afterPaid.available,
    `${afterDeclined.available} un.`,
  );

  // --- Pix: reserva e confirmacao -----------------------------------------
  section('Pix (reserva enquanto aguarda pagamento)');
  const pixBuyer = session();
  await pixBuyer('/cart/items', { method: 'POST', body: { productId: target.id, quantity: 1 } });
  const pixOrder = await pixBuyer('/checkout', {
    method: 'POST',
    body: { email: 'pix@teste.dev', shippingAddress: ADDRESS, paymentMethod: 'pix' },
  });
  check('pedido pix fica PENDING_PAYMENT', pixOrder.body?.order?.status === 'PENDING_PAYMENT');
  check('codigo pix e devolvido', Boolean(pixOrder.body?.order?.payment?.payload?.copyPaste));

  const duringReservation = await availableOf(list.items.find((p) => p.id === target.id)?.slug ?? '');
  check(
    'unidade fica reservada antes do pagamento',
    duringReservation.available === afterDeclined.available - 1,
    `${duringReservation.available} disponiveis`,
  );

  await pixBuyer(`/orders/${pixOrder.body.order.number}/simulate-payment`, {
    method: 'POST',
    body: { outcome: 'paid' },
  });
  const afterPix = await availableOf(list.items.find((p) => p.id === target.id)?.slug ?? '');
  check(
    'confirmar o pix nao baixa duas vezes',
    afterPix.available === duringReservation.available,
    `${afterPix.available} disponiveis`,
  );

  // --- Corrida pela ultima unidade ----------------------------------------
  section('Concorrencia: N compradores, 1 unidade');
  const all = await fetch(`${API}/catalog/products?perPage=60`).then((r) => r.json());
  const scarce = all.items
    .filter((p) => p.stock.available > 0)
    .sort((a, b) => a.stock.available - b.stock.available)[0];

  const contenders = 8;
  const attempts = await Promise.all(
    Array.from({ length: contenders }, async (_, i) => {
      const s = session();
      const added = await s('/cart/items', { method: 'POST', body: { productId: scarce.id, quantity: 1 } });
      if (!added.ok) {
        return { ok: false, phase: 'carrinho', httpStatus: added.status, code: added.body?.error?.code };
      }
      const out = await s('/checkout', {
        method: 'POST',
        body: {
          email: `corrida${i}@teste.dev`,
          shippingAddress: ADDRESS,
          paymentMethod: 'credit_card',
          card: APPROVED_CARD,
        },
      });
      return {
        ok: out.ok,
        phase: 'checkout',
        httpStatus: out.status,
        code: out.body?.error?.code,
        status: out.body?.order?.status,
      };
    }),
  );

  const winners = attempts.filter((a) => a.ok && a.status === 'PAID');
  const rejected = attempts.filter((a) => !a.ok);
  // Nao enumeramos codigos "aceitaveis": varias recusas sao legitimas
  // (estoque acabou, carrinho precisa de revisao, rate limit). O invariante de
  // verdade e que nenhuma tentativa perdida vire erro de servidor.
  const serverErrors = rejected.filter((a) => a.httpStatus >= 500);

  check(
    'ninguem compra alem do estoque',
    winners.length <= scarce.stock.available,
    `${winners.length} aprovado(s) para ${scarce.stock.available} un. de "${scarce.name}"`,
  );
  check(
    'a disputa produz ao menos um vencedor',
    winners.length >= 1 || rejected.every((a) => a.code === 'rate_limited'),
  );
  check(
    'quem perdeu recebe erro de negocio, nao 500',
    serverErrors.length === 0,
    serverErrors.length > 0
      ? `${serverErrors.length} resposta(s) 5xx`
      : `${rejected.length} bloqueado(s): ${[...new Set(rejected.map((a) => a.code))].join(', ')}`,
  );

  const afterRace = await availableOf(scarce.slug);
  check('estoque final nunca fica negativo', afterRace.available >= 0, `${afterRace.available} un.`);

  // --- Guardas do painel admin --------------------------------------------
  section('Painel administrativo');
  const anon = session();
  const blocked = await anon('/admin/dashboard');
  check('visitante nao acessa o admin', blocked.status === 401 || blocked.status === 403);

  const customer = session();
  await customer('/auth/login', {
    method: 'POST',
    body: { email: 'cliente@lockimini.dev', password: 'cliente1234' },
  });
  const forbidden = await customer('/admin/dashboard');
  check('cliente comum nao acessa o admin', forbidden.status === 403);

  const admin = session();
  const login = await admin('/auth/login', {
    method: 'POST',
    body: { email: 'admin@lockimini.dev', password: 'admin1234' },
  });
  check('admin faz login', login.ok && login.body.user.role === 'ADMIN');

  const dashboard = await admin('/admin/dashboard?days=30');
  check('dashboard responde', dashboard.ok, `receita ${(dashboard.body?.kpis?.revenueCents ?? 0) / 100}`);

  // Deixa um pix pendente de proposito: ele mantem unidades reservadas, que e
  // exatamente a situacao em que o ajuste manual precisa ser barrado.
  const pending = session();
  await pending('/cart/items', { method: 'POST', body: { productId: target.id, quantity: 2 } });
  await pending('/checkout', {
    method: 'POST',
    body: { email: 'reserva@teste.dev', shippingAddress: ADDRESS, paymentMethod: 'pix' },
  });

  const stock = await admin('/admin/stock');
  const withReserve = stock.body.items.find((i) => i.reserved > 0);
  check('reserva ativa aparece no painel', Boolean(withReserve), `${withReserve?.reserved ?? 0} un. reservadas`);

  if (withReserve) {
    const bad = await admin(`/admin/stock/${withReserve.productId}/set`, {
      method: 'POST',
      body: { quantity: Math.max(0, withReserve.reserved - 1) },
    });
    check('ajuste abaixo do reservado e recusado', bad.status === 409, bad.body?.error?.code);
  }

  const adjusted = await admin(`/admin/stock/${target.id}/adjust`, {
    method: 'POST',
    body: { delta: 5, reason: 'PURCHASE_ORDER', note: 'smoke test' },
  });
  check('entrada de estoque pelo admin funciona', adjusted.ok, `${adjusted.body?.stock?.available} disponiveis`);

  const movements = await admin(`/admin/stock/movements?productId=${target.id}`);
  check('movimentacao fica registrada no historico', (movements.body?.items?.length ?? 0) > 0);

  // --- Resultado -----------------------------------------------------------
  console.log(`\n${'-'.repeat(50)}`);
  console.log(`${passed} verificacao(oes) ok, ${failed} falha(s)`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nO smoke test quebrou:', err);
  process.exit(1);
});
