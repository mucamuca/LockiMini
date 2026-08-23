import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler } from '../../lib/async.js';
import { q, validate } from '../../middleware/validate.js';
import { adjustStock, expireStaleReservations, setStockQuantity } from '../../services/stock.js';
import { parseImages } from '../../services/serializers.js';
import { variantLabel } from '../../services/variants.js';

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

    // A tabela ja lista uma linha por variacao (Inventory e por combinacao);
    // aqui so buscamos os rotulos para o operador saber qual e qual.
    const variantIds = rows.map((r) => r.variantId).filter(Boolean);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, sku: true, colorName: true, colorHex: true, sizeName: true, priceCents: true },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    let items = rows.map((r) => {
      const v = r.variantId ? byId.get(r.variantId) : undefined;
      return {
      productId: r.productId,
      variantId: r.variantId || null,
      variantLabel: v ? variantLabel(v) : null,
      colorHex: v?.colorHex ?? null,
      name: r.product.name,
      sku: v?.sku ?? r.product.sku,
      imageUrl: parseImages(r.product.images)[0] ?? null,
      active: r.product.active,
      priceCents: v?.priceCents ?? r.product.priceCents,
      quantity: r.quantity,
      reserved: r.reserved,
      available: Math.max(0, r.quantity - r.reserved),
      lowStockThreshold: r.lowStockThreshold,
      updatedAt: r.updatedAt,
      };
    });

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
  /** Vazio/ausente = produto sem variacao. */
  variantId: z.string().optional(),
  delta: z.coerce.number().int().refine((n) => n !== 0, 'Informe uma quantidade diferente de zero.'),
  reason: z.enum(['PURCHASE_ORDER', 'MANUAL_ADJUSTMENT', 'LOSS', 'RETURN']).default('MANUAL_ADJUSTMENT'),
  note: z.string().max(200).optional(),
});

/** Entrada/saida relativa (+10 de uma nota fiscal, -2 de uma perda). */
adminStockRouter.post(
  '/:productId/adjust',
  validate(adjustSchema),
  asyncHandler(async (req, res) => {
    const { delta, reason, note, variantId } = req.body as z.infer<typeof adjustSchema>;
    const stock = await adjustStock({
      productId: req.params.productId,
      variantId,
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
  validate(
    z.object({
      quantity: z.coerce.number().int().min(0),
      note: z.string().max(200).optional(),
      variantId: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { quantity, note, variantId } = req.body as {
      quantity: number;
      note?: string;
      variantId?: string;
    };
    const stock = await setStockQuantity(req.params.productId, quantity, req.user!.sub, note, variantId);
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
