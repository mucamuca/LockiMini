import type { Prisma } from '@prisma/client';
import { availableOf, thresholdOf } from './stock.js';
import { NO_VARIANT, stockOfVariant, variantAxes, variantLabel } from './variants.js';

export function parseImages(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((i): i is string => typeof i === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * O include que productDTO exige, num lugar so.
 *
 * Cada rota que serializa produto precisa trazer exatamente estas relacoes.
 * Exportar a constante em vez de repetir o literal significa que acrescentar
 * uma relacao no futuro nao deixa uma rota para tras.
 */
export const PRODUCT_INCLUDE = {
  inventory: true,
  category: true,
  variants: true,
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export function productDTO(p: ProductWithRelations) {
  // Com variacoes, o disponivel do produto e a soma das linhas de estoque.
  const available = availableOf(p.inventory);
  const threshold = thresholdOf(p.inventory);
  const activeVariants = [...p.variants]
    .filter((v) => v.active)
    .sort((a, b) => a.position - b.position);

  const variants = activeVariants.map((v) => ({
    id: v.id,
    sku: v.sku,
    label: variantLabel(v),
    colorName: v.colorName,
    colorHex: v.colorHex,
    sizeName: v.sizeName,
    // O front nunca precisa decidir se o preco vem da variacao ou do produto:
    // aqui ja sai resolvido.
    priceCents: v.priceCents ?? p.priceCents,
    imageUrl: v.imageUrl,
    stock: stockOfVariant(p.inventory, v.id),
  }));

  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    description: p.description,
    priceCents: p.priceCents,
    compareAtCents: p.compareAtCents,
    currency: p.currency,
    images: parseImages(p.images),
    featured: p.featured,
    active: p.active,
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
    stock: {
      available,
      // Com variacoes, "acabando" so vale quando nenhuma delas tem folga.
      lowStock:
        available > 0 &&
        (variants.length > 0
          ? variants.every((v) => v.stock.lowStock || v.stock.outOfStock)
          : available <= threshold),
      outOfStock: available <= 0,
    },
    variants,
    /** Os eixos que este produto usa — a tela monta os seletores a partir daqui. */
    options: variantAxes(activeVariants),
    /** Menor preco entre as variacoes; e o "a partir de" da vitrine. */
    fromPriceCents: variants.length > 0 ? Math.min(...variants.map((v) => v.priceCents)) : p.priceCents,
    createdAt: p.createdAt,
  };
}

/** Versao para o admin: expoe quantidade fisica e reservada. */
export function adminProductDTO(p: ProductWithRelations) {
  const base = p.inventory.find((i) => i.variantId === NO_VARIANT);
  const latest = p.inventory.reduce<Date | null>(
    (acc, i) => (!acc || i.updatedAt > acc ? i.updatedAt : acc),
    null,
  );
  return {
    ...productDTO(p),
    inventory: {
      quantity: p.inventory.reduce((n, i) => n + i.quantity, 0),
      reserved: p.inventory.reduce((n, i) => n + i.reserved, 0),
      available: availableOf(p.inventory),
      lowStockThreshold: base?.lowStockThreshold ?? thresholdOf(p.inventory),
      updatedAt: latest,
    },
    weightGrams: p.weightGrams,
    categoryId: p.categoryId,
  };
}

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: true; payments: true };
}>;

export function orderDTO(o: OrderWithRelations) {
  const payment = o.payments.at(-1);
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    email: o.email,
    subtotalCents: o.subtotalCents,
    shippingCents: o.shippingCents,
    discountCents: o.discountCents,
    totalCents: o.totalCents,
    currency: o.currency,
    shippingAddress: safeJson(o.shippingAddress),
    notes: o.notes,
    createdAt: o.createdAt,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      sku: i.sku,
      variantId: i.variantId,
      variantLabel: i.variantLabel,
      imageUrl: i.imageUrl,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
      totalCents: i.totalCents,
    })),
    payment: payment
      ? {
          id: payment.id,
          provider: payment.provider,
          method: payment.method,
          status: payment.status,
          amountCents: payment.amountCents,
          payload: payment.payload ? safeJson(payment.payload) : null,
          failureCode: payment.failureCode,
        }
      : null,
  };
}

export function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
