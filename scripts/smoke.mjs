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
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    available: product.stock.available,
    priceCents: product.priceCents,
    variants: product.variants ?? [],
  };
};

/**
 * O que enviar ao carrinho para comprar este produto.
 *
 * Produto com variacoes exige a escolha; o preco cobrado e o da variacao, que
 * pode diferir do preco base. Sem este helper cada teste teria que repetir a
 * mesma decisao.
 */
const buyable = (p, qty = 1) => {
  const variant = p.variants.find((v) => v.stock.available >= qty) ?? p.variants[0];
  return {
    body: { productId: p.id, quantity: qty, ...(variant ? { variantId: variant.id } : {}) },
    unitPriceCents: variant ? variant.priceCents : p.priceCents,
    variant,
  };
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
  const pick = buyable(target, 2);

  await buyer('/cart/items', { method: 'POST', body: pick.body });
  const cart = await buyer('/cart');
  check(
    'carrinho soma o subtotal',
    cart.body.cart.subtotalCents === pick.unitPriceCents * 2,
    pick.variant ? `variacao "${pick.variant.label}"` : 'produto sem variacao',
  );

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
  await declined('/cart/items', { method: 'POST', body: buyable(target, 1).body });
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
  await pixBuyer('/cart/items', { method: 'POST', body: buyable(target, 1).body });
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

  // A disputa e pela unidade vendavel mais escassa. Com variacoes, isso e uma
  // COMBINACAO especifica — e ai que a guarda atomica precisa valer: dois
  // clientes brigando pelo ultimo "Grafite / 75%" nao podem ambos vencer, e
  // nenhum deles pode travar a venda do "Branco Gelo / 60%".
  const sellable = all.items.flatMap((p) =>
    p.variants.length > 0
      ? p.variants
          .filter((v) => v.stock.available > 0)
          .map((v) => ({ product: p, variantId: v.id, label: `${p.name} (${v.label})`, available: v.stock.available }))
      : p.stock.available > 0
        ? [{ product: p, variantId: null, label: p.name, available: p.stock.available }]
        : [],
  );
  const scarcest = sellable.sort((a, b) => a.available - b.available)[0];
  const scarce = {
    id: scarcest.product.id,
    slug: scarcest.product.slug,
    name: scarcest.label,
    stock: { available: scarcest.available },
  };
  const scarceBody = {
    productId: scarcest.product.id,
    quantity: 1,
    ...(scarcest.variantId ? { variantId: scarcest.variantId } : {}),
  };

  const contenders = 8;
  const attempts = await Promise.all(
    Array.from({ length: contenders }, async (_, i) => {
      const s = session();
      const added = await s('/cart/items', { method: 'POST', body: scarceBody });
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
  const afterVariant = scarcest.variantId
    ? afterRace.variants.find((v) => v.id === scarcest.variantId)?.stock.available
    : afterRace.available;
  check('estoque final nunca fica negativo', afterVariant >= 0, `${afterVariant} un.`);
  check(
    'a disputa nao afetou as outras variacoes',
    scarcest.variantId
      ? afterRace.variants
          .filter((v) => v.id !== scarcest.variantId)
          .every((v) => {
            const antes = all.items
              .find((p) => p.id === scarcest.product.id)
              .variants.find((o) => o.id === v.id);
            return v.stock.available === antes.stock.available;
          })
      : true,
    scarcest.variantId ? 'demais combinacoes intactas' : '(produto sem variacao)',
  );

  // --- Variacoes (cor e tamanho) -------------------------------------------
  section('Variacoes de produto');
  const comVariacao = all.items.find((p) => p.variants.length > 1);

  if (!comVariacao) {
    check('existe produto com variacoes no catalogo', false, 'nenhum encontrado');
  } else {
    const detalhe = await availableOf(comVariacao.slug);
    const vA = detalhe.variants.find((v) => v.stock.available >= 2);
    const vB = detalhe.variants.find((v) => v.id !== vA?.id && v.stock.available > 0);

    check(
      'produto expoe eixos de cor/tamanho',
      comVariacao.options.colors.length > 0 || comVariacao.options.sizes.length > 0,
      `${comVariacao.name}: ${comVariacao.options.colors.length} cor(es), ${comVariacao.options.sizes.length} tamanho(s)`,
    );

    // Sem escolher, o pedido chegaria impossivel de separar no deposito.
    const semEscolha = session();
    const recusa = await semEscolha('/cart/items', {
      method: 'POST',
      body: { productId: detalhe.id, quantity: 1 },
    });
    check(
      'exige a escolha da variacao',
      !recusa.ok && recusa.body?.error?.code === 'variant_required',
      `codigo: ${recusa.body?.error?.code ?? recusa.status}`,
    );

    // Uma variacao inexistente nao pode passar por validacao.
    const forjada = session();
    const invalida = await forjada('/cart/items', {
      method: 'POST',
      body: { productId: detalhe.id, variantId: 'nao-existe', quantity: 1 },
    });
    check('recusa variacao inexistente', !invalida.ok, `HTTP ${invalida.status}`);

    // Comprar uma cor nao pode consumir o estoque da outra.
    const antesA = vA.stock.available;
    const antesB = vB.stock.available;

    const compradorVar = session();
    await compradorVar('/cart/items', {
      method: 'POST',
      body: { productId: detalhe.id, variantId: vA.id, quantity: 2 },
    });
    const carrinhoVar = await compradorVar('/cart');
    check(
      'carrinho cobra o preco da variacao',
      carrinhoVar.body.cart.subtotalCents === vA.priceCents * 2,
      `${vA.label}: ${carrinhoVar.body.cart.subtotalCents} vs ${vA.priceCents * 2}`,
    );
    check(
      'carrinho identifica a variacao escolhida',
      carrinhoVar.body.cart.items[0].variantLabel === vA.label,
      carrinhoVar.body.cart.items[0].variantLabel ?? '(sem rotulo)',
    );

    const pedidoVar = await compradorVar('/checkout', {
      method: 'POST',
      body: {
        email: 'variacao@teste.dev',
        shippingAddress: ADDRESS,
        paymentMethod: 'credit_card',
        card: APPROVED_CARD,
      },
    });
    check('pedido com variacao e aprovado', pedidoVar.body?.order?.status === 'PAID');
    check(
      'pedido guarda o rotulo da variacao',
      pedidoVar.body?.order?.items?.[0]?.variantLabel === vA.label,
      pedidoVar.body?.order?.items?.[0]?.variantLabel ?? '(vazio)',
    );

    const depois = await availableOf(detalhe.slug);
    const depoisA = depois.variants.find((v) => v.id === vA.id).stock.available;
    const depoisB = depois.variants.find((v) => v.id === vB.id).stock.available;

    check('a variacao comprada baixa o estoque', depoisA === antesA - 2, `${antesA} -> ${depoisA}`);
    check(
      'a variacao NAO comprada fica intacta',
      depoisB === antesB,
      `${vB.label}: ${antesB} -> ${depoisB}`,
    );

    // Duas pessoas disputando a mesma combinacao especifica.
    const alvo = depois.variants.find((v) => v.stock.available === 1)
      ?? depois.variants.filter((v) => v.stock.available > 0).sort((a, b) => a.stock.available - b.stock.available)[0];
    if (alvo) {
      const disputa = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const s2 = session();
          const add = await s2('/cart/items', {
            method: 'POST',
            body: { productId: detalhe.id, variantId: alvo.id, quantity: alvo.stock.available },
          });
          if (!add.ok) return { ok: false };
          const out = await s2('/checkout', {
            method: 'POST',
            body: {
              email: 'disputa@teste.dev',
              shippingAddress: ADDRESS,
              paymentMethod: 'credit_card',
              card: APPROVED_CARD,
            },
          });
          return { ok: out.ok && out.body?.order?.status === 'PAID', status: out.status };
        }),
      );
      const ganhadores = disputa.filter((d) => d.ok).length;
      const erros5xx = disputa.filter((d) => d.status >= 500).length;
      check(
        'disputa por uma combinacao nao gera oversell',
        ganhadores <= 1,
        `${ganhadores} aprovado(s) para ${alvo.stock.available} un. de "${alvo.label}"`,
      );
      check('disputa por variacao nao gera erro 5xx', erros5xx === 0);

      const fim = await availableOf(detalhe.slug);
      check(
        'estoque da combinacao nunca fica negativo',
        fim.variants.every((v) => v.stock.available >= 0),
      );
    }
  }

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
  await pending('/cart/items', { method: 'POST', body: buyable(target, 2).body });
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
