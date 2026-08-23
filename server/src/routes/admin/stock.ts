import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler } from '../../lib/async.js';
import { q, validate } from '../../middleware/validate.js';
import { adjustStock, expireStaleReservations, setStockQuantity } from '../../services/stock.js';
import { parseImages } from '../../services/serializers.js';

export const adminStockRouter = Router();

const listQuery = z.object({
  filter: z.enum(['all', 'low', 'out', 'reserved']).default('all'),
  search: z.string().trim().optional(),
});

/** Visao operacional do estoque: fisico, reservado e disponivel lado a lado. */
adminStockRouter.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { filter, search } = q<z.infer<typeof listQuery>>(req);
    const rows = await prisma.inventory.findMany({
      include: { product: { select: { id: true, name: true, sku: true, images: true, active: true, priceCents: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    });

    let items = rows.map((r) => ({
      productId: r.productId,
      name: r.product.name,
      sku: r.product.sku,
      imageUrl: parseImages(r.product.images)[0] ?? null,
      active: r.product.active,
      priceCents: r.product.priceCents,
      quantity: r.quantity,
      reserved: r.reserved,
      available: Math.max(0, r.quantity - r.reserved),
      lowStockThreshold: r.lowStockThreshold,
      updatedAt: r.updatedAt,
    }));

    if (search) {
      const needle = search.toLowerCase();
      items = items.filter(
        (i) => i.name.toLowerCase().includes(needle) || i.sku.toLowerCase().includes(needle),
      );
    }
    if (filter === 'low') items = items.filter((i) => i.available > 0 && i.available <= i.lowStockThreshold);
    if (filter === 'out') items = items.filter((i) => i.available <= 0);
    if (filter === 'reserved') items = items.filter((i) => i.reserved > 0);

    res.json({
      items,
      summary: {
        totalSkus: rows.length,
        outOfStock: rows.filter((r) => r.quantity - r.reserved <= 0).length,
        lowStock: rows.filter(
          (r) => r.quantity - r.reserved > 0 && r.quantity - r.reserved <= r.lowStockThreshold,
        ).length,
        unitsOnHand: rows.reduce((s, r) => s + r.quantity, 0),
        unitsReserved: rows.reduce((s, r) => s + r.reserved, 0),
      },
    });
  }),
);

const adjustSchema = z.object({
  delta: z.coerce.number().int().refine((n) => n !== 0, 'Informe uma quantidade diferente de zero.'),
  reason: z.enum(['PURCHASE_ORDER', 'MANUAL_ADJUSTMENT', 'LOSS', 'RETURN']).default('MANUAL_ADJUSTMENT'),
  note: z.string().max(200).optional(),
});

/** Entrada/saida relativa (+10 de uma nota fiscal, -2 de uma perda). */
adminStockRouter.post(
  '/:productId/adjust',
  validate(adjustSchema),
  asyncHandler(async (req, res) => {
    const { delta, reason, note } = req.body as z.infer<typeof adjustSchema>;
    const stock = await adjustStock({
      productId: req.params.productId,
      delta,
      reason,
      note,
      actorId: req.user!.sub,
    });
    res.json({ stock });
  }),
);

/** Contagem de inventario: define o valor absoluto. */
adminStockRouter.post(
  '/:productId/set',
  validate(z.object({ quantity: z.coerce.number().int().min(0), note: z.string().max(200).optional() })),
  asyncHandler(async (req, res) => {
    const { quantity, note } = req.body as { quantity: number; note?: string };
    const stock = await setStockQuantity(req.params.productId, quantity, req.user!.sub, note);
    res.json({ stock });
  }),
);

adminStockRouter.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const productId = req.query.productId ? String(req.query.productId) : undefined;
    const movements = await prisma.stockMovement.findMany({
      where: productId ? { productId } : undefined,
      include: {
        product: { select: { name: true, sku: true } },
        actor: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ items: movements });
  }),
);

/** Roda a limpeza de reservas vencidas sob demanda. */
adminStockRouter.post(
  '/expire-reservations',
  asyncHandler(async (_req, res) => {
    res.json(await expireStaleReservations());
  }),
);
