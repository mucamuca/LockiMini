import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async.js';
import { validate } from '../middleware/validate.js';
import { getPaymentProvider } from '../payments/index.js';
import { getCartView, resolveCart } from '../services/cart.js';
import { checkout, resolveCoupon } from '../services/orders.js';
import { badRequest } from '../http/errors.js';
import { env } from '../env.js';

export const checkoutRouter = Router();

// Segura tentativa em massa de cartao sem punir picos legitimos: varios
// clientes podem sair pelo mesmo IP (empresa, operadora movel, proxy).
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Aguarde um instante antes de tentar de novo.' } },
});

const addressSchema = z.object({
  recipient: z.string().min(2, 'Informe o nome de quem vai receber.'),
  line1: z.string().min(3, 'Informe o endereco.'),
  line2: z.string().optional(),
  district: z.string().min(2, 'Informe o bairro.'),
  city: z.string().min(2, 'Informe a cidade.'),
  state: z.string().length(2, 'Use a sigla do estado (ex.: SP).'),
  postalCode: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP invalido.'),
  country: z.string().default('BR'),
  phone: z.string().optional(),
});

const cardSchema = z.object({
  number: z.string().min(13).max(23),
  holder: z.string().min(2, 'Informe o nome impresso no cartao.'),
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(new Date().getFullYear()).max(2100),
  cvv: z.string().regex(/^\d{3,4}$/, 'CVV invalido.'),
  installments: z.coerce.number().int().min(1).max(12).default(1),
});

const checkoutSchema = z
  .object({
    email: z.string().email('E-mail invalido.').toLowerCase(),
    shippingAddress: addressSchema,
    paymentMethod: z.enum(['credit_card', 'pix', 'boleto']),
    card: cardSchema.optional(),
    couponCode: z.string().trim().max(40).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.paymentMethod !== 'credit_card' || data.card !== undefined, {
    message: 'Preencha os dados do cartao.',
    path: ['card'],
  });

checkoutRouter.get('/payment-methods', (_req, res) => {
  const provider = getPaymentProvider();
  res.json({
    provider: provider.name,
    methods: provider.methods,
    // Cartoes de teste so fazem sentido no gateway simulado.
    testCards:
      provider.name === 'mock'
        ? [
            { number: '4242 4242 4242 4242', result: 'Aprovado' },
            { number: '4000 0000 0000 0002', result: 'Recusado pelo emissor' },
            { number: '4000 0000 0000 9995', result: 'Saldo insuficiente' },
          ]
        : [],
    reservationTtlMinutes: env.RESERVATION_TTL_MINUTES,
  });
});

checkoutRouter.post(
  '/coupon/preview',
  validate(z.object({ code: z.string().trim().min(1) })),
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, res);
    const view = await getCartView(cart.id);
    const { discountCents, coupon } = await resolveCoupon(
      (req.body as { code: string }).code,
      view.subtotalCents,
    );
    res.json({
      code: coupon?.code,
      discountCents,
      totalCents: Math.max(0, view.subtotalCents - discountCents) + view.shippingCents,
    });
  }),
);

checkoutRouter.post(
  '/',
  checkoutLimiter,
  validate(checkoutSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof checkoutSchema>;
    const cart = await resolveCart(req, res);

    const view = await getCartView(cart.id);
    if (view.items.length === 0) throw badRequest('Seu carrinho esta vazio.', 'empty_cart');
    if (view.hasIssues) {
      throw badRequest(
        'Alguns itens do carrinho mudaram de disponibilidade. Revise antes de finalizar.',
        'cart_needs_review',
        { items: view.items.filter((i) => i.issue) },
      );
    }

    const result = await checkout({
      cartId: cart.id,
      userId: req.user?.sub,
      email: body.email,
      shippingAddress: body.shippingAddress,
      couponCode: body.couponCode,
      paymentMethod: body.paymentMethod,
      card: body.card,
      notes: body.notes,
    });

    // Sempre 201: o pedido foi criado com sucesso mesmo quando o emissor recusa
    // o cartao. O desfecho do pagamento vem em `paymentStatus`, e o front leva o
    // cliente para a pagina do pedido em qualquer um dos casos.
    res.status(201).json(result);
  }),
);

/** Estado do pagamento para o front fazer polling enquanto o pix nao cai. */
checkoutRouter.get(
  '/status/:orderNumber',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { number: req.params.orderNumber },
      include: { payments: true },
    });
    if (!order) throw badRequest('Pedido nao encontrado.', 'not_found');
    const payment = order.payments.at(-1);
    res.json({
      status: order.status,
      paymentStatus: payment?.status ?? null,
      failureCode: payment?.failureCode ?? null,
    });
  }),
);
