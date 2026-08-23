import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler } from '../../lib/async.js';
import { slugify } from '../../lib/slug.js';
import { imageRef } from '../../lib/zod.js';
import { badRequest, notFound } from '../../http/errors.js';
import { q, validate } from '../../middleware/validate.js';
import { adminProductDTO, PRODUCT_INCLUDE } from '../../services/serializers.js';
import { publishStock } from '../../services/stock.js';

export const adminProductsRouter = Router();

const listQuery = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().optional(),
  status: z.enum(['all', 'active', 'inactive', 'low_stock', 'out_of_stock']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

adminProductsRouter.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const filters = q<z.infer<typeof listQuery>>(req);
    const where: Prisma.ProductWhereInput = {};
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { sku: { contains: filters.search } },
      ];
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status === 'active') where.active = true;
    if (filters.status === 'inactive') where.active = false;

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.perPage,
        take: filters.perPage,
      }),
      prisma.product.count({ where }),
    ]);

    let items = rows.map(adminProductDTO);
    if (filters.status === 'low_stock') {
      items = items.filter((p) => p.inventory.available > 0 && p.inventory.available <= p.inventory.lowStockThreshold);
    }
    if (filters.status === 'out_of_stock') items = items.filter((p) => p.inventory.available <= 0);

    res.json({ items, page: filters.page, perPage: filters.perPage, total });
  }),
);

adminProductsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw notFound('Produto nao encontrado.');
    const movements = await prisma.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { actor: { select: { name: true } } },
    });
    res.json({ product: adminProductDTO(product), movements });
  }),
);

const productSchema = z.object({
  sku: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().optional(),
  description: z.string().trim().min(1).max(4000),
  priceCents: z.coerce.number().int().min(0),
  compareAtCents: z.coerce.number().int().min(0).nullable().optional(),
  currency: z.string().default('BRL'),
  images: z.array(imageRef).default([]),
  categoryId: z.string().nullable().optional(),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  weightGrams: z.coerce.number().int().min(0).default(500),
  quantity: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
});

adminProductsRouter.post(
  '/',
  validate(productSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof productSchema>;
    const slug = slugify(data.slug || data.name);

    const product = await prisma.product.create({
      data: {
        sku: data.sku,
        name: data.name,
        slug,
        description: data.description,
        priceCents: data.priceCents,
        compareAtCents: data.compareAtCents ?? null,
        currency: data.currency,
        images: JSON.stringify(data.images),
        categoryId: data.categoryId || null,
        active: data.active,
        featured: data.featured,
        weightGrams: data.weightGrams,
        inventory: {
          // variantId "" — produto novo nasce sem variacoes; elas sao criadas
          // depois, pelas rotas de /variacoes.
          create: { quantity: data.quantity, lowStockThreshold: data.lowStockThreshold },
        },
      },
      include: PRODUCT_INCLUDE,
    });

    if (data.quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          delta: data.quantity,
          reason: 'PURCHASE_ORDER',
          note: 'Estoque inicial',
          actorId: req.user!.sub,
        },
      });
    }
    await publishStock([product.id]);
    res.status(201).json({ product: adminProductDTO(product) });
  }),
);

const updateSchema = productSchema.partial().omit({ quantity: true });

adminProductsRouter.patch(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Produto nao encontrado.');

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        sku: data.sku,
        name: data.name,
        slug: data.slug ? slugify(data.slug) : data.name ? slugify(data.name) : undefined,
        description: data.description,
        priceCents: data.priceCents,
        compareAtCents: data.compareAtCents,
        currency: data.currency,
        images: data.images ? JSON.stringify(data.images) : undefined,
        categoryId: data.categoryId === undefined ? undefined : data.categoryId || null,
        active: data.active,
        featured: data.featured,
        weightGrams: data.weightGrams,
        // inventory e uma lista desde que existem variacoes: o limiar de alerta
        // vale para todas as linhas do produto.
        inventory:
          data.lowStockThreshold !== undefined
            ? { updateMany: { where: {}, data: { lowStockThreshold: data.lowStockThreshold } } }
            : undefined,
      },
      include: PRODUCT_INCLUDE,
    });

    await publishStock([product.id]);
    res.json({ product: adminProductDTO(product) });
  }),
);

/**
 * Produto com historico de vendas nunca e apagado — vira inativo, para nao
 * quebrar pedidos antigos que apontam para ele.
 */
adminProductsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const sold = await prisma.orderItem.count({ where: { productId: req.params.id } });
    if (sold > 0) {
      const product = await prisma.product.update({
        where: { id: req.params.id },
        data: { active: false },
        include: PRODUCT_INCLUDE,
      });
      return res.json({
        product: adminProductDTO(product),
        archived: true,
        message: 'Produto tem vendas registradas: foi desativado em vez de excluido.',
      });
    }
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  }),
);

// --- Categorias ---

export const adminCategoriesRouter = Router();

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().optional(),
  imageUrl: imageRef.nullable().optional(),
});

adminCategoriesRouter.post(
  '/',
  validate(categorySchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof categorySchema>;
    const category = await prisma.category.create({
      data: { name: data.name, slug: slugify(data.slug || data.name), imageUrl: data.imageUrl ?? null },
    });
    res.status(201).json({ category });
  }),
);

adminCategoriesRouter.patch(
  '/:id',
  validate(categorySchema.partial()),
  asyncHandler(async (req, res) => {
    const data = req.body as Partial<z.infer<typeof categorySchema>>;
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        slug: data.slug ? slugify(data.slug) : data.name ? slugify(data.name) : undefined,
        imageUrl: data.imageUrl,
      },
    });
    res.json({ category });
  }),
);

adminCategoriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const count = await prisma.product.count({ where: { categoryId: req.params.id } });
    if (count > 0) {
      throw badRequest(
        `Esta categoria tem ${count} produto(s). Mova-os antes de excluir.`,
        'category_not_empty',
      );
    }
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  }),
);
