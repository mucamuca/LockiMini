import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler } from '../../lib/async.js';
import { q, validate } from '../../middleware/validate.js';
import { orderDTO, parseImages } from '../../services/serializers.js';

export const adminDashboardRouter = Router();

/** Status que contam como receita realizada. */
const REVENUE_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const;

const rangeQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/**
 * Chave YYYY-MM-DD no fuso do servidor.
 *
 * toISOString() daria a data em UTC: numa loja em BRT, tudo que vende depois das
 * 21h cairia no dia seguinte do grafico. O dia do relatorio precisa ser o dia da
 * loja, nao o de Greenwich.
 */
function localDateKey(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

adminDashboardRouter.get(
  '/',
  validate(rangeQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { days } = q<z.infer<typeof rangeQuery>>(req);
    const since = new Date(Date.now() - days * 864e5);
    const previousSince = new Date(Date.now() - days * 2 * 864e5);

    const [current, previous, statusCounts, inventory, recentOrders, customers] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: since }, status: { in: [...REVENUE_STATUSES] } },
        include: { items: true },
      }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: previousSince, lt: since },
          status: { in: [...REVENUE_STATUSES] },
        },
        select: { totalCents: true },
      }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.inventory.findMany({
        include: { product: { select: { id: true, name: true, sku: true, images: true, active: true } } },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { items: true, payments: true },
      }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ]);

    const revenueCents = current.reduce((s, o) => s + o.totalCents, 0);
    const previousRevenueCents = previous.reduce((s, o) => s + o.totalCents, 0);
    const revenueChangePercent =
      previousRevenueCents === 0
        ? null
        : Math.round(((revenueCents - previousRevenueCents) / previousRevenueCents) * 100);

    // Serie diaria para o grafico, sem buracos nos dias sem venda.
    const byDay = new Map<string, { revenueCents: number; orders: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const key = localDateKey(new Date(Date.now() - i * 864e5));
      byDay.set(key, { revenueCents: 0, orders: 0 });
    }
    for (const order of current) {
      const key = localDateKey(order.createdAt);
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.revenueCents += order.totalCents;
        bucket.orders += 1;
      }
    }

    // Ranking de produtos pelo que efetivamente saiu no periodo.
    const productSales = new Map<string, { name: string; units: number; revenueCents: number }>();
    for (const order of current) {
      for (const item of order.items) {
        const key = item.productId ?? item.sku;
        const entry = productSales.get(key) ?? { name: item.name, units: 0, revenueCents: 0 };
        entry.units += item.quantity;
        entry.revenueCents += item.totalCents;
        productSales.set(key, entry);
      }
    }

    const lowStock = inventory
      .filter((i) => i.product.active && i.quantity - i.reserved <= i.lowStockThreshold)
      .sort((a, b) => a.quantity - a.reserved - (b.quantity - b.reserved))
      .slice(0, 10)
      .map((i) => ({
        productId: i.productId,
        name: i.product.name,
        sku: i.product.sku,
        imageUrl: parseImages(i.product.images)[0] ?? null,
        available: Math.max(0, i.quantity - i.reserved),
        reserved: i.reserved,
        threshold: i.lowStockThreshold,
      }));

    res.json({
      rangeDays: days,
      kpis: {
        revenueCents,
        revenueChangePercent,
        orders: current.length,
        averageTicketCents: current.length > 0 ? Math.round(revenueCents / current.length) : 0,
        unitsSold: current.reduce((s, o) => s + o.items.reduce((n, i) => n + i.quantity, 0), 0),
        customers,
        pendingPayment: statusCounts.find((s) => s.status === 'PENDING_PAYMENT')?._count._all ?? 0,
        toShip:
          (statusCounts.find((s) => s.status === 'PAID')?._count._all ?? 0) +
          (statusCounts.find((s) => s.status === 'PROCESSING')?._count._all ?? 0),
      },
      statusBreakdown: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
      salesSeries: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      topProducts: [...productSales.entries()]
        .map(([productId, v]) => ({ productId, ...v }))
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 6),
      lowStock,
      recentOrders: recentOrders.map(orderDTO),
      inventoryValueCents: 0,
    });
  }),
);

export const adminCustomersRouter = Router();

adminCustomersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = req.query.search ? String(req.query.search) : undefined;
    const users = await prisma.user.findMany({
      where: search
        ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { orders: true } }, orders: { select: { totalCents: true, status: true } } },
    });
    res.json({
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt,
        orderCount: u._count.orders,
        lifetimeValueCents: u.orders
          .filter((o) => REVENUE_STATUSES.includes(o.status as (typeof REVENUE_STATUSES)[number]))
          .reduce((s, o) => s + o.totalCents, 0),
      })),
    });
  }),
);

export const adminCouponsRouter = Router();

const couponSchema = z
  .object({
    code: z.string().trim().min(3).max(40).toUpperCase(),
    percentOff: z.coerce.number().int().min(1).max(90).nullable().optional(),
    amountOffCents: z.coerce.number().int().min(1).nullable().optional(),
    minSubtotalCents: z.coerce.number().int().min(0).default(0),
    active: z.boolean().default(true),
    expiresAt: z.coerce.date().nullable().optional(),
    maxUses: z.coerce.number().int().min(1).nullable().optional(),
  })
  .refine((d) => d.percentOff != null || d.amountOffCents != null, {
    message: 'Informe um percentual ou um valor fixo de desconto.',
    path: ['percentOff'],
  });

adminCouponsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ items: await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }) });
  }),
);

adminCouponsRouter.post(
  '/',
  validate(couponSchema),
  asyncHandler(async (req, res) => {
    const coupon = await prisma.coupon.create({ data: req.body as z.infer<typeof couponSchema> });
    res.status(201).json({ coupon });
  }),
);

adminCouponsRouter.patch(
  '/:id',
  validate(z.object({ active: z.boolean() })),
  asyncHandler(async (req, res) => {
    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: { active: (req.body as { active: boolean }).active },
    });
    res.json({ coupon });
  }),
);

adminCouponsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  }),
);
