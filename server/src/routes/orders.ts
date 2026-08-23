import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { asyncHandler } from '../lib/async.js';
import { forbidden, notFound } from '../http/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { q, validate } from '../middleware/validate.js';
import { getPaymentProvider } from '../payments/index.js';
import { orderDTO } from '../services/serializers.js';
import { confirmPaymentByRef, failPaymentByRef, transitionOrder } from '../services/orders.js';

export const ordersRouter = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(10),
});

ordersRouter.get(
  '/',
  requireAuth,
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { page, perPage } = q<z.infer<typeof listQuery>>(req);
    const where = { userId: req.user!.sub };
    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.order.count({ where }),
    ]);
    res.json({ items: rows.map(orderDTO), page, perPage, total });
  }),
);

/**
 * Aceita o pedido de um cliente logado OU de um visitante que informe o e-mail
 * usado na compra — quem comprou sem conta tambem precisa acompanhar o pedido.
 */
ordersRouter.get(
  '/:number',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { number: req.params.number },
      include: { items: true, payments: true },
    });
    if (!order) throw notFound('Pedido nao encontrado.');

    const isOwner = req.user && order.userId === req.user.sub;
    const isAdmin = req.user?.role === 'ADMIN';
    const guestEmail = String(req.query.email ?? '').toLowerCase();
    const guestMatch = guestEmail.length > 0 && guestEmail === order.email.toLowerCase();

    if (!isOwner && !isAdmin && !guestMatch) {
      throw forbidden('Informe o e-mail usado na compra para ver este pedido.');
    }
    res.json({ order: orderDTO(order) });
  }),
);

ordersRouter.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw notFound('Pedido nao encontrado.');
    if (order.userId !== req.user!.sub) throw forbidden();
    // Depois de pago, o cancelamento passa pelo atendimento (rota admin).
    if (order.status !== 'PENDING_PAYMENT') {
      throw forbidden('Este pedido nao pode mais ser cancelado por aqui. Fale com o suporte.');
    }
    const updated = await transitionOrder(order.id, 'CANCELLED');
    res.json({ order: { id: updated.id, number: updated.number, status: updated.status } });
  }),
);

/**
 * Simulador de confirmacao de pix/boleto.
 *
 * Existe apenas com o gateway mock fora de producao: em producao quem confirma
 * um pix e o webhook do provedor, nunca uma chamada do proprio front.
 */
ordersRouter.post(
  '/:number/simulate-payment',
  validate(z.object({ outcome: z.enum(['paid', 'failed']).default('paid') })),
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === 'production' || getPaymentProvider().name !== 'mock') {
      throw forbidden('Simulacao disponivel apenas com o gateway de testes.');
    }
    const order = await prisma.order.findUnique({
      where: { number: req.params.number },
      include: { payments: true },
    });
    if (!order) throw notFound('Pedido nao encontrado.');

    const payment = order.payments.at(-1);
    if (!payment?.providerRef) throw notFound('Pagamento nao encontrado.');

    const { outcome } = req.body as { outcome: 'paid' | 'failed' };
    const updated =
      outcome === 'paid'
        ? await confirmPaymentByRef(payment.providerRef)
        : await failPaymentByRef(payment.providerRef, 'simulated_failure');

    res.json({ order: { id: updated.id, number: updated.number, status: updated.status } });
  }),
);
