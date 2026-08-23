import { Router } from 'express';
import { Prisma, type OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler } from '../../lib/async.js';
import { notFound } from '../../http/errors.js';
import { q, validate } from '../../middleware/validate.js';
import { orderDTO } from '../../services/serializers.js';
import { transitionOrder } from '../../services/orders.js';

export const adminOrdersRouter = Router();

const STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;

const listQuery = z.object({
  status: z.enum(['all', ...STATUSES]).default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

adminOrdersRouter.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const filters = q<z.infer<typeof listQuery>>(req);
    const where: Prisma.OrderWhereInput = {};
    if (filters.status !== 'all') where.status = filters.status as OrderStatus;
    if (filters.search) {
      where.OR = [
        { number: { contains: filters.search } },
        { email: { contains: filters.search } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.perPage,
        take: filters.perPage,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ items: rows.map(orderDTO), page: filters.page, perPage: filters.perPage, total });
  }),
);

adminOrdersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        payments: true,
        user: { select: { id: true, name: true, email: true } },
        reservations: { include: { product: { select: { name: true, sku: true } } } },
      },
    });
    if (!order) throw notFound('Pedido nao encontrado.');
    res.json({
      order: { ...orderDTO(order), customer: order.user, reservations: order.reservations },
    });
  }),
);

adminOrdersRouter.post(
  '/:id/status',
  validate(z.object({ status: z.enum(STATUSES) })),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: OrderStatus };
    const order = await transitionOrder(req.params.id, status, req.user!.sub);
    res.json({ order: { id: order.id, number: order.number, status: order.status } });
  }),
);

adminOrdersRouter.patch(
  '/:id/notes',
  validate(z.object({ notes: z.string().max(1000) })),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { notes: (req.body as { notes: string }).notes },
    });
    res.json({ order: { id: order.id, notes: order.notes } });
  }),
);
