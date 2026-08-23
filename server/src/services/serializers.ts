import type { Prisma } from '@prisma/client';
import { availableOf } from './stock.js';

export function parseImages(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((i): i is string => typeof i === 'string') : [];
  } catch {
    return [];
  }
}

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { inventory: true; category: true };
}>;

export function productDTO(p: ProductWithRelations) {
  const available = availableOf(p.inventory);
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
      lowStock: available > 0 && available <= (p.inventory?.lowStockThreshold ?? 5),
      outOfStock: available <= 0,
    },
    createdAt: p.createdAt,
  };
}

/** Versao para o admin: expoe quantidade fisica e reservada. */
export function adminProductDTO(p: ProductWithRelations) {
  return {
    ...productDTO(p),
    inventory: {
      quantity: p.inventory?.quantity ?? 0,
      reserved: p.inventory?.reserved ?? 0,
      available: availableOf(p.inventory),
      lowStockThreshold: p.inventory?.lowStockThreshold ?? 5,
      updatedAt: p.inventory?.updatedAt ?? null,
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
