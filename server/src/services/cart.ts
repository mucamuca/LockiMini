import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma, withWriteRetry } from '../db.js';
import { env } from '../env.js';
import { CART_COOKIE, setCartCookie } from '../lib/tokens.js';
import { availableOf } from './stock.js';
import { parseImages } from './serializers.js';
import { conflict, notFound } from '../http/errors.js';

const newToken = () => crypto.randomBytes(24).toString('hex');

/**
 * Sempre devolve um carrinho utilizavel.
 *
 * Visitante → carrinho preso ao cookie. Ao logar, o carrinho anonimo e fundido
 * ao do usuario (somando quantidades) para nao perder o que foi montado antes
 * do login.
 */
export async function resolveCart(req: Request, res: Response) {
  return withWriteRetry(() => resolveCartOnce(req, res));
}

async function resolveCartOnce(req: Request, res: Response) {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[CART_COOKIE];
  const userId = req.user?.sub;

  if (userId) {
    const userCart =
      (await prisma.cart.findFirst({ where: { userId } })) ??
      (await prisma.cart.create({ data: { userId, token: newToken() } }));

    if (cookieToken && cookieToken !== userCart.token) {
      const anon = await prisma.cart.findUnique({ where: { token: cookieToken }, include: { items: true } });
      if (anon && !anon.userId && anon.items.length > 0) {
        await mergeCarts(anon.id, userCart.id);
      }
      if (anon && !anon.userId) {
        await prisma.cart.delete({ where: { id: anon.id } }).catch(() => undefined);
      }
    }
    if (cookieToken !== userCart.token) setCartCookie(res, userCart.token);
    return userCart;
  }

  if (cookieToken) {
    const existing = await prisma.cart.findUnique({ where: { token: cookieToken } });
    if (existing) return existing;
  }

  const created = await prisma.cart.create({ data: { token: newToken() } });
  setCartCookie(res, created.token);
  return created;
}

async function mergeCarts(fromCartId: string, intoCartId: string) {
  const items = await prisma.cart.findUnique({ where: { id: fromCartId }, include: { items: true } });
  if (!items) return;
  for (const item of items.items) {
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: intoCartId, productId: item.productId } },
    });
    const inventory = await prisma.inventory.findUnique({ where: { productId: item.productId } });
    const cap = availableOf(inventory);
    const merged = Math.min((existing?.quantity ?? 0) + item.quantity, Math.max(cap, 1));
    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: merged } });
    } else {
      await prisma.cartItem.create({
        data: { cartId: intoCartId, productId: item.productId, quantity: merged },
      });
    }
  }
}

export type CartView = Awaited<ReturnType<typeof getCartView>>;

/**
 * Monta o carrinho conferindo o estoque AGORA.
 * Um item pode ter sido esgotado por outro cliente depois de adicionado — em vez
 * de esconder isso, o item volta marcado com o problema e o front avisa.
 */
export async function getCartView(cartId: string) {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: { items: { include: { product: { include: { inventory: true } } }, orderBy: { createdAt: 'asc' } } },
  });
  if (!cart) throw notFound('Carrinho nao encontrado.');

  const items = cart.items.map((item) => {
    const available = availableOf(item.product.inventory);
    const unavailable = !item.product.active || available <= 0;
    const overBooked = !unavailable && item.quantity > available;
    return {
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      slug: item.product.slug,
      sku: item.product.sku,
      imageUrl: parseImages(item.product.images)[0] ?? null,
      unitPriceCents: item.product.priceCents,
      quantity: item.quantity,
      totalCents: item.product.priceCents * item.quantity,
      stock: { available, unavailable, overBooked },
      issue: unavailable
        ? 'Produto indisponivel no momento.'
        : overBooked
          ? `Restam apenas ${available} un. em estoque.`
          : null,
    };
  });

  const sellable = items.filter((i) => !i.stock.unavailable);
  const subtotalCents = sellable.reduce(
    (sum, i) => sum + i.unitPriceCents * Math.min(i.quantity, i.stock.available),
    0,
  );
  const shippingCents =
    subtotalCents === 0 || subtotalCents >= env.FREE_SHIPPING_THRESHOLD_CENTS
      ? 0
      : env.FLAT_SHIPPING_CENTS;

  return {
    id: cart.id,
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    currency: 'BRL',
    freeShippingThresholdCents: env.FREE_SHIPPING_THRESHOLD_CENTS,
    missingForFreeShippingCents: Math.max(0, env.FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents),
    hasIssues: items.some((i) => i.issue !== null),
  };
}

export async function addToCart(cartId: string, productId: string, quantity: number) {
  return withWriteRetry(() => addToCartOnce(cartId, productId, quantity));
}

async function addToCartOnce(cartId: string, productId: string, quantity: number) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { inventory: true },
  });
  if (!product || !product.active) throw notFound('Produto indisponivel.');

  const available = availableOf(product.inventory);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId, productId } },
  });
  const desired = (existing?.quantity ?? 0) + quantity;

  if (available <= 0) throw conflict('Produto esgotado.', 'out_of_stock', { productId, available });
  if (desired > available) {
    throw conflict(
      `So temos ${available} un. de "${product.name}" disponiveis.`,
      'insufficient_stock',
      { productId, requested: desired, available },
    );
  }

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: desired } });
  } else {
    await prisma.cartItem.create({ data: { cartId, productId, quantity } });
  }
  return getCartView(cartId);
}

export async function updateCartItem(cartId: string, itemId: string, quantity: number) {
  return withWriteRetry(() => updateCartItemOnce(cartId, itemId, quantity));
}

async function updateCartItemOnce(cartId: string, itemId: string, quantity: number) {
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId },
    include: { product: { include: { inventory: true } } },
  });
  if (!item) throw notFound('Item nao encontrado no carrinho.');

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    return getCartView(cartId);
  }

  const available = availableOf(item.product.inventory);
  if (quantity > available) {
    throw conflict(`So temos ${available} un. disponiveis.`, 'insufficient_stock', {
      productId: item.productId,
      requested: quantity,
      available,
    });
  }
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return getCartView(cartId);
}

export async function removeCartItem(cartId: string, itemId: string) {
  await prisma.cartItem.deleteMany({ where: { id: itemId, cartId } });
  return getCartView(cartId);
}

export async function clearCart(cartId: string) {
  await prisma.cartItem.deleteMany({ where: { cartId } });
  return getCartView(cartId);
}
