import type { StockReason } from '@prisma/client';
import { TX_OPTIONS, prisma, withWriteRetry, type Tx } from '../db.js';
import { conflict, notFound } from '../http/errors.js';
import { emitStockBatch, type StockEvent } from '../realtime.js';
import { env } from '../env.js';

export type StockLine = { productId: string; quantity: number };

/**
 * Le o estado atual e publica no canal de tempo real.
 * Sempre chamado DEPOIS do commit — evita anunciar um estoque que pode sofrer rollback.
 */
export async function publishStock(productIds: string[]) {
  const unique = [...new Set(productIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const rows = await prisma.inventory.findMany({
    where: { productId: { in: unique } },
    include: { product: { select: { sku: true } } },
  });
  const events: StockEvent[] = rows.map((r) => {
    const available = Math.max(0, r.quantity - r.reserved);
    return {
      productId: r.productId,
      sku: r.product?.sku ?? '',
      available,
      quantity: r.quantity,
      reserved: r.reserved,
      lowStock: available > 0 && available <= r.lowStockThreshold,
      outOfStock: available <= 0,
    };
  });
  emitStockBatch(events);
  return events;
}

/**
 * Reserva unidades de forma atomica.
 *
 * A guarda `quantity - reserved >= ?` mora dentro do proprio UPDATE, entao duas
 * requisicoes simultaneas disputando a ultima unidade nunca podem ambas vencer:
 * o banco serializa os UPDATEs e o segundo afeta 0 linhas.
 */
export async function reserveStock(tx: Tx, lines: StockLine[]): Promise<void> {
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const affected = await tx.$executeRaw`
      UPDATE "Inventory"
         SET "reserved" = "reserved" + ${line.quantity},
             "updatedAt" = ${new Date()}
       WHERE "productId" = ${line.productId}
         AND "quantity" - "reserved" >= ${line.quantity}
    `;
    if (affected === 0) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { name: true, inventory: { select: { quantity: true, reserved: true } } },
      });
      const available = product?.inventory
        ? Math.max(0, product.inventory.quantity - product.inventory.reserved)
        : 0;
      throw conflict(
        `Estoque insuficiente para "${product?.name ?? line.productId}". Disponivel: ${available}.`,
        'insufficient_stock',
        { productId: line.productId, requested: line.quantity, available },
      );
    }
  }
}

/** Cria as reservas do pedido com prazo de validade. */
export async function createReservations(tx: Tx, orderId: string, lines: StockLine[]) {
  const expiresAt = new Date(Date.now() + env.RESERVATION_TTL_MINUTES * 60_000);
  await tx.stockReservation.createMany({
    data: lines.map((l) => ({ orderId, productId: l.productId, quantity: l.quantity, expiresAt })),
  });
  return expiresAt;
}

/**
 * Pagamento confirmado: a reserva vira baixa definitiva.
 * quantity e reserved caem juntos, entao o disponivel nao oscila.
 */
export async function consumeReservations(tx: Tx, orderId: string) {
  const reservations = await tx.stockReservation.findMany({ where: { orderId, status: 'ACTIVE' } });
  for (const r of reservations) {
    await tx.$executeRaw`
      UPDATE "Inventory"
         SET "quantity" = "quantity" - ${r.quantity},
             "reserved" = MAX("reserved" - ${r.quantity}, 0),
             "updatedAt" = ${new Date()}
       WHERE "productId" = ${r.productId}
    `;
    await tx.stockMovement.create({
      data: { productId: r.productId, delta: -r.quantity, reason: 'SALE', orderId },
    });
  }
  await tx.stockReservation.updateMany({
    where: { orderId, status: 'ACTIVE' },
    data: { status: 'CONSUMED' },
  });
  return reservations.map((r) => r.productId);
}

/** Pedido cancelado/expirado/falhou: devolve o disponivel ao catalogo. */
export async function releaseReservations(
  tx: Tx,
  orderId: string,
  reason: StockReason = 'CANCELLATION',
) {
  const reservations = await tx.stockReservation.findMany({ where: { orderId, status: 'ACTIVE' } });
  for (const r of reservations) {
    await tx.$executeRaw`
      UPDATE "Inventory"
         SET "reserved" = MAX("reserved" - ${r.quantity}, 0),
             "updatedAt" = ${new Date()}
       WHERE "productId" = ${r.productId}
    `;
  }
  if (reservations.length > 0) {
    // Nada saiu do estoque fisico: registramos apenas a liberacao logica (delta 0).
    await tx.stockMovement.createMany({
      data: reservations.map((r) => ({
        productId: r.productId,
        delta: 0,
        reason,
        orderId,
        note: `Reserva de ${r.quantity} un. liberada`,
      })),
    });
  }
  await tx.stockReservation.updateMany({
    where: { orderId, status: 'ACTIVE' },
    data: { status: 'RELEASED' },
  });
  return reservations.map((r) => r.productId);
}

/** Devolve unidades ao estoque fisico (estorno de pedido ja pago). */
export async function restockOrder(tx: Tx, orderId: string, reason: StockReason = 'RETURN') {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  const touched: string[] = [];
  for (const item of items) {
    if (!item.productId) continue;
    await tx.$executeRaw`
      UPDATE "Inventory"
         SET "quantity" = "quantity" + ${item.quantity},
             "updatedAt" = ${new Date()}
       WHERE "productId" = ${item.productId}
    `;
    await tx.stockMovement.create({
      data: { productId: item.productId, delta: item.quantity, reason, orderId },
    });
    touched.push(item.productId);
  }
  return touched;
}

/** Ajuste manual do admin (entrada de nota, perda, inventario ciclico). */
export async function adjustStock(opts: {
  productId: string;
  delta: number;
  reason: StockReason;
  note?: string;
  actorId?: string;
}) {
  const { productId, delta, reason, note, actorId } = opts;
  await withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({ where: { productId } });
      if (!inventory) throw notFound('Produto sem registro de estoque.');

      // Nunca deixamos o fisico cair abaixo do que ja esta reservado por pedidos abertos.
      const affected = await tx.$executeRaw`
        UPDATE "Inventory"
           SET "quantity" = "quantity" + ${delta},
               "updatedAt" = ${new Date()}
         WHERE "productId" = ${productId}
           AND "quantity" + ${delta} >= "reserved"
      `;
      if (affected === 0) {
        throw conflict(
          `Ajuste recusado: restariam ${inventory.quantity + delta} un. com ${inventory.reserved} un. reservadas em pedidos abertos.`,
          'reserved_conflict',
        );
      }
      await tx.stockMovement.create({ data: { productId, delta, reason, note, actorId } });
    }, TX_OPTIONS),
  );
  const [event] = await publishStock([productId]);
  return event;
}

/** Define a quantidade absoluta (contagem de inventario). */
export async function setStockQuantity(
  productId: string,
  quantity: number,
  actorId?: string,
  note?: string,
) {
  const inventory = await prisma.inventory.findUnique({ where: { productId } });
  if (!inventory) throw notFound('Produto sem registro de estoque.');
  const delta = quantity - inventory.quantity;
  if (delta === 0) return (await publishStock([productId]))[0];
  return adjustStock({
    productId,
    delta,
    reason: 'MANUAL_ADJUSTMENT',
    note: note ?? 'Contagem de inventario',
    actorId,
  });
}

/**
 * Varredura periodica: reservas vencidas voltam para o catalogo e o pedido
 * correspondente e cancelado se o pagamento nunca chegou.
 */
export async function expireStaleReservations() {
  const now = new Date();
  const expired = await prisma.stockReservation.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    select: { orderId: true },
    distinct: ['orderId'],
  });
  if (expired.length === 0) return { orders: 0, products: [] as string[] };

  const touched = new Set<string>();
  for (const { orderId } of expired) {
    try {
      const productIds = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
        if (!order || order.status !== 'PENDING_PAYMENT') {
          // Pedido ja avancou: encerra reservas orfas sem mexer no estoque.
          await tx.stockReservation.updateMany({
            where: { orderId, status: 'ACTIVE', expiresAt: { lt: now } },
            data: { status: 'RELEASED' },
          });
          return [] as string[];
        }
        const ids = await releaseReservations(tx, orderId, 'CANCELLATION');
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            notes: 'Cancelado automaticamente: pagamento nao confirmado no prazo.',
          },
        });
        await tx.payment.updateMany({
          where: { orderId, status: 'PENDING' },
          data: { status: 'FAILED', failureCode: 'expired' },
        });
        return ids;
      });
      productIds.forEach((id) => touched.add(id));
    } catch (err) {
      console.error(`[estoque] falha ao expirar reservas do pedido ${orderId}`, err);
    }
  }

  const products = [...touched];
  await publishStock(products);
  if (products.length > 0) {
    console.log(
      `[estoque] ${expired.length} pedido(s) expirado(s), ${products.length} produto(s) devolvido(s) ao catalogo.`,
    );
  }
  return { orders: expired.length, products };
}

export function startStockJanitor(intervalMs = 60_000) {
  const timer = setInterval(() => {
    expireStaleReservations().catch((e) => console.error('[estoque] janitor', e));
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export const availableOf = (inv?: { quantity: number; reserved: number } | null) =>
  inv ? Math.max(0, inv.quantity - inv.reserved) : 0;
