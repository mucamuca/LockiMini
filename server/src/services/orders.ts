import crypto from 'node:crypto';
import type { OrderStatus } from '@prisma/client';
import { TX_OPTIONS, prisma, withWriteRetry } from '../db.js';
import { env } from '../env.js';
import { badRequest, conflict, notFound, unprocessable } from '../http/errors.js';
import { getPaymentProvider, type CardDetails, type PaymentMethod } from '../payments/index.js';
import { emitOrderCreated, emitOrderUpdated } from '../realtime.js';
import { orderDTO, parseImages } from './serializers.js';
import {
  consumeReservations,
  createReservations,
  publishStock,
  releaseReservations,
  reserveStock,
  restockOrder,
} from './stock.js';

export type ShippingAddress = {
  recipient: string;
  line1: string;
  line2?: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  phone?: string;
};

function generateOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `LK-${new Date().getFullYear()}-${stamp}${rand}`;
}

/** Valida o cupom e devolve o desconto em centavos (nunca maior que o subtotal). */
export async function resolveCoupon(code: string | undefined, subtotalCents: number) {
  if (!code) return { discountCents: 0, coupon: null };
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon || !coupon.active) throw unprocessable('Cupom invalido.', 'invalid_coupon');
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw unprocessable('Cupom expirado.', 'expired_coupon');
  }
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) {
    throw unprocessable('Cupom esgotado.', 'exhausted_coupon');
  }
  if (subtotalCents < coupon.minSubtotalCents) {
    throw unprocessable(
      `Este cupom vale para compras a partir de R$ ${(coupon.minSubtotalCents / 100).toFixed(2)}.`,
      'coupon_min_subtotal',
    );
  }
  const percent = coupon.percentOff ? Math.floor((subtotalCents * coupon.percentOff) / 100) : 0;
  const flat = coupon.amountOffCents ?? 0;
  const discountCents = Math.min(subtotalCents, Math.max(percent, flat));
  return { discountCents, coupon };
}

export type CheckoutInput = {
  cartId: string;
  userId?: string;
  email: string;
  shippingAddress: ShippingAddress;
  couponCode?: string;
  paymentMethod: PaymentMethod;
  card?: CardDetails;
  notes?: string;
};

/**
 * Checkout em duas fases.
 *
 * Fase 1 (transacional): precos sao recalculados a partir do banco, o estoque e
 * RESERVADO e o pedido nasce como PENDING_PAYMENT. Nenhuma chamada externa
 * acontece aqui dentro — I/O de rede dentro de transacao trava o banco.
 *
 * Fase 2 (fora da transacao): o gateway e chamado. Se aprovar, a reserva vira
 * baixa definitiva; se recusar, a reserva e devolvida ao catalogo na hora.
 */
export async function checkout(input: CheckoutInput) {
  const cart = await prisma.cart.findUnique({
    where: { id: input.cartId },
    include: { items: { include: { product: { include: { inventory: true } } } } },
  });
  if (!cart || cart.items.length === 0) throw badRequest('Seu carrinho esta vazio.', 'empty_cart');

  const inactive = cart.items.filter((i) => !i.product.active);
  if (inactive.length > 0) {
    throw conflict(
      `Remova do carrinho: ${inactive.map((i) => i.product.name).join(', ')}.`,
      'inactive_products',
    );
  }

  const lines = cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
  const subtotalCents = cart.items.reduce((sum, i) => sum + i.product.priceCents * i.quantity, 0);
  const { discountCents, coupon } = await resolveCoupon(input.couponCode, subtotalCents);
  const shippingCents =
    subtotalCents >= env.FREE_SHIPPING_THRESHOLD_CENTS ? 0 : env.FLAT_SHIPPING_CENTS;
  const totalCents = Math.max(0, subtotalCents - discountCents) + shippingCents;

  const order = await withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      // Lanca 409 com o produto culpado se alguem levou a ultima unidade.
      await reserveStock(tx, lines);

      const created = await tx.order.create({
        data: {
          number: generateOrderNumber(),
          userId: input.userId ?? null,
          email: input.email,
          status: 'PENDING_PAYMENT',
          subtotalCents,
          shippingCents,
          discountCents,
          totalCents,
          currency: 'BRL',
          shippingAddress: JSON.stringify({
            ...input.shippingAddress,
            country: input.shippingAddress.country ?? 'BR',
          }),
          notes: input.notes ?? null,
          items: {
            create: cart.items.map((i) => ({
              productId: i.productId,
              name: i.product.name,
              sku: i.product.sku,
              imageUrl: parseImages(i.product.images)[0] ?? null,
              unitPriceCents: i.product.priceCents,
              quantity: i.quantity,
              totalCents: i.product.priceCents * i.quantity,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      await createReservations(tx, created.id, lines);
      if (coupon) {
        await tx.coupon.update({ where: { id: coupon.id }, data: { uses: { increment: 1 } } });
      }
      // O carrinho e esvaziado agora: o estoque ja esta reservado no pedido.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return created;
    }, TX_OPTIONS),
  );

  await publishStock(lines.map((l) => l.productId));

  const provider = getPaymentProvider();
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: provider.name,
      method: input.paymentMethod,
      status: 'PENDING',
      amountCents: totalCents,
    },
  });

  let charge;
  try {
    charge = await provider.charge({
      orderId: order.id,
      orderNumber: order.number,
      amountCents: totalCents,
      currency: 'BRL',
      method: input.paymentMethod,
      customer: { email: input.email, name: input.shippingAddress.recipient },
      card: input.card,
    });
  } catch (err) {
    console.error('[pagamento] gateway indisponivel', err);
    await failOrder(order.id, payment.id, 'gateway_error', 'Gateway de pagamento indisponivel.');
    throw new Error('Nao foi possivel processar o pagamento. Tente novamente.');
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerRef: charge.providerRef,
      status: charge.status === 'PAID' ? 'PAID' : charge.status === 'FAILED' ? 'FAILED' : 'PENDING',
      payload: charge.payload ? JSON.stringify(charge.payload) : null,
      failureCode: charge.failureCode ?? null,
    },
  });

  if (charge.status === 'PAID') {
    await settleOrderPaid(order.id);
  } else if (charge.status === 'FAILED') {
    await failOrder(order.id, payment.id, charge.failureCode ?? 'declined', charge.failureMessage);
  }

  const finalOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true, payments: true },
  });
  const dto = orderDTO(finalOrder);
  emitOrderCreated({ id: dto.id, number: dto.number, status: dto.status, totalCents: dto.totalCents }, input.userId);

  return {
    order: dto,
    paymentStatus: charge.status,
    failureMessage: charge.failureMessage ?? null,
  };
}

/** Pagamento confirmado: reserva vira baixa de estoque e o pedido vira PAID. */
export async function settleOrderPaid(orderId: string) {
  const productIds = await withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
      if (!order) throw notFound('Pedido nao encontrado.');
      // Idempotente: webhook pode chegar duas vezes.
      if (order.status !== 'PENDING_PAYMENT') return [] as string[];

      const ids = await consumeReservations(tx, orderId);
      await tx.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
      await tx.payment.updateMany({
        where: { orderId, status: { in: ['PENDING', 'AUTHORIZED'] } },
        data: { status: 'PAID' },
      });
      return ids;
    }, TX_OPTIONS),
  );

  await publishStock(productIds);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  emitOrderUpdated({ id: order.id, number: order.number, status: order.status }, order.userId);
  return order;
}

/** Pagamento recusado: devolve a reserva ao catalogo imediatamente. */
export async function failOrder(
  orderId: string,
  paymentId?: string,
  failureCode = 'declined',
  message?: string,
) {
  const productIds = await withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      const ids = await releaseReservations(tx, orderId, 'CANCELLATION');
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', notes: message ?? 'Pagamento nao aprovado.' },
      });
      await tx.payment.updateMany({
        where: paymentId ? { id: paymentId } : { orderId, status: 'PENDING' },
        data: { status: 'FAILED', failureCode },
      });
      return ids;
    }, TX_OPTIONS),
  );
  await publishStock(productIds);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  emitOrderUpdated({ id: order.id, number: order.number, status: order.status }, order.userId);
  return order;
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'SHIPPED', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Mudanca de status pelo admin, com as consequencias de estoque embutidas:
 * cancelar um pedido pago devolve as unidades, estornar tambem.
 */
export async function transitionOrder(orderId: string, next: OrderStatus, actorId?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true },
  });
  if (!order) throw notFound('Pedido nao encontrado.');
  if (order.status === next) return order;

  const allowed = ALLOWED_TRANSITIONS[order.status];
  if (!allowed.includes(next)) {
    throw conflict(
      `Nao e possivel mudar de ${order.status} para ${next}.`,
      'invalid_transition',
      { from: order.status, to: next, allowed },
    );
  }

  const wasPaid = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status);
  const touched: string[] = [];

  if (next === 'REFUNDED') {
    const payment = order.payments.find((p) => p.status === 'PAID');
    if (payment?.providerRef) {
      await getPaymentProvider().refund(payment.providerRef, payment.amountCents);
    }
  }

  await withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      // Zerado a cada tentativa: uma retentativa nao pode herdar o que a
      // tentativa anterior registrou antes do rollback.
      touched.length = 0;

      if (next === 'CANCELLED' || next === 'REFUNDED') {
        if (wasPaid) {
          // Ja tinha saido do estoque fisico: devolve as unidades.
          touched.push(
            ...(await restockOrder(tx, orderId, next === 'REFUNDED' ? 'RETURN' : 'CANCELLATION')),
          );
        } else {
          // Ainda era so reserva: libera.
          touched.push(...(await releaseReservations(tx, orderId, 'CANCELLATION')));
        }
        await tx.payment.updateMany({
          where: { orderId, status: { in: ['PAID', 'AUTHORIZED'] } },
          data: { status: next === 'REFUNDED' ? 'REFUNDED' : 'FAILED' },
        });
      }

      if (next === 'PAID' && order.status === 'PENDING_PAYMENT') {
        touched.push(...(await consumeReservations(tx, orderId)));
        await tx.payment.updateMany({
          where: { orderId, status: 'PENDING' },
          data: { status: 'PAID' },
        });
      }

      await tx.order.update({ where: { id: orderId }, data: { status: next } });
      if (actorId && touched.length > 0) {
        await tx.stockMovement.updateMany({ where: { orderId, actorId: null }, data: { actorId } });
      }
    }, TX_OPTIONS),
  );

  await publishStock(touched);
  const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  emitOrderUpdated({ id: updated.id, number: updated.number, status: updated.status }, updated.userId);
  return updated;
}

/** Confirmacao de pix/boleto vinda do webhook (ou do simulador em dev). */
export async function confirmPaymentByRef(providerRef: string) {
  const payment = await prisma.payment.findUnique({ where: { providerRef } });
  if (!payment) throw notFound('Pagamento nao encontrado.');
  return settleOrderPaid(payment.orderId);
}

export async function failPaymentByRef(providerRef: string, code = 'declined') {
  const payment = await prisma.payment.findUnique({ where: { providerRef } });
  if (!payment) throw notFound('Pagamento nao encontrado.');
  return failOrder(payment.orderId, payment.id, code, 'Pagamento nao aprovado pelo emissor.');
}

export async function refundPaymentByRef(providerRef: string) {
  const payment = await prisma.payment.findUnique({ where: { providerRef } });
  if (!payment) throw notFound('Pagamento nao encontrado.');
  return transitionOrder(payment.orderId, 'REFUNDED');
}
