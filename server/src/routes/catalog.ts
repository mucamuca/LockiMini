import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async.js';
import { notFound } from '../http/errors.js';
import { q, validate } from '../middleware/validate.js';
import { productDTO, PRODUCT_INCLUDE } from '../services/serializers.js';

export const catalogRouter = Router();

const listQuery = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  featured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: z.enum(['recent', 'price_asc', 'price_desc', 'name']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(60).default(12),
});

const ORDER_BY: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  recent: { createdAt: 'desc' },
  price_asc: { priceCents: 'asc' },
  price_desc: { priceCents: 'desc' },
  name: { name: 'asc' },
};

catalogRouter.get(
  '/products',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const filters = q<z.infer<typeof listQuery>>(req);

    const where: Prisma.ProductWhereInput = { active: true };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } },
        { sku: { contains: filters.search } },
      ];
    }
    if (filters.category) where.category = { slug: filters.category };
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.priceCents = {
        gte: filters.minPrice !== undefined ? Math.round(filters.minPrice * 100) : undefined,
        lte: filters.maxPrice !== undefined ? Math.round(filters.maxPrice * 100) : undefined,
      };
    }
    if (filters.featured) where.featured = true;

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: ORDER_BY[filters.sort],
        skip: (filters.page - 1) * filters.perPage,
        take: filters.perPage,
      }),
      prisma.product.count({ where }),
    ]);

    let items = rows.map(productDTO);
    // "Somente disponiveis" depende de quantity - reserved, que o Prisma nao
    // sabe comparar entre colunas: filtramos depois de serializar.
    if (filters.inStock) items = items.filter((p) => !p.stock.outOfStock);

    res.json({
      items,
      page: filters.page,
      perPage: filters.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.perPage)),
    });
  }),
);

catalogRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, active: true },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw notFound('Produto nao encontrado.');

    const related = await prisma.product.findMany({
      where: {
        active: true,
        categoryId: product.categoryId,
        NOT: { id: product.id },
      },
      include: PRODUCT_INCLUDE,
      take: 4,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ product: productDTO(product), related: related.map(productDTO) });
  }),
);

catalogRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { active: true } } } } },
    });
    res.json({
      items: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        imageUrl: c.imageUrl,
        productCount: c._count.products,
      })),
    });
  }),
);

/** Snapshot de estoque — usado no primeiro render, antes do socket conectar. */
catalogRouter.get(
  '/stock',
  asyncHandler(async (req, res) => {
    const ids = String(req.query.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const rows = await prisma.inventory.findMany({
      where: ids.length > 0 ? { productId: { in: ids } } : undefined,
      take: 200,
    });
    res.json({
      items: rows.map((r) => ({
        productId: r.productId,
        available: Math.max(0, r.quantity - r.reserved),
        lowStock: r.quantity - r.reserved > 0 && r.quantity - r.reserved <= r.lowStockThreshold,
        outOfStock: r.quantity - r.reserved <= 0,
      })),
    });
  }),
);
