import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../http/errors.js';

/**
 * Sentinela de "produto sem variacao".
 *
 * Vive aqui, num lugar so, para que nenhuma consulta precise repetir uma string
 * vazia solta no meio do codigo. Ver o comentario de Inventory.variantId no
 * schema para o motivo de nao ser NULL.
 */
export const NO_VARIANT = '';

export type VariantRow = {
  id: string;
  colorName: string | null;
  colorHex: string | null;
  sizeName: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  sku: string;
  active: boolean;
  position: number;
};

/** "Preto / M", "Preto", "M" — o que existir, nessa ordem. */
export function variantLabel(v: Pick<VariantRow, 'colorName' | 'sizeName'>): string {
  return [v.colorName, v.sizeName].filter(Boolean).join(' / ');
}

/** O preco da variacao quando ela sobrepoe; senao o do produto. */
export function variantPrice(product: { priceCents: number }, v?: { priceCents: number | null } | null) {
  return v?.priceCents ?? product.priceCents;
}

/**
 * Descobre quais eixos o produto usa.
 *
 * Um produto pode variar so em cor, so em tamanho, ou nos dois. A tela de
 * produto monta os seletores a partir disto, entao um produto que so tem cor
 * nao mostra um seletor de tamanho vazio.
 */
export function variantAxes(variants: VariantRow[]) {
  const colors: { name: string; hex: string | null }[] = [];
  const sizes: string[] = [];
  for (const v of variants) {
    if (v.colorName && !colors.some((c) => c.name === v.colorName)) {
      colors.push({ name: v.colorName, hex: v.colorHex });
    }
    if (v.sizeName && !sizes.includes(v.sizeName)) sizes.push(v.sizeName);
  }
  return { colors, sizes };
}

type InventoryRow = { variantId: string; quantity: number; reserved: number; lowStockThreshold: number };

/** Estoque de uma variacao especifica dentro da lista do produto. */
export function stockOfVariant(inventory: InventoryRow[], variantId: string) {
  const row = inventory.find((i) => i.variantId === variantId);
  const quantity = row?.quantity ?? 0;
  const reserved = row?.reserved ?? 0;
  const available = Math.max(0, quantity - reserved);
  const threshold = row?.lowStockThreshold ?? 5;
  return {
    available,
    quantity,
    reserved,
    lowStock: available > 0 && available <= threshold,
    outOfStock: available <= 0,
  };
}

/**
 * Valida a variacao escolhida contra o produto.
 *
 * Produto com variacoes exige escolha — sem isto, um cliente conseguiria
 * comprar "uma camiseta" sem tamanho, e o pedido chegaria impossivel de separar
 * no deposito. Produto sem variacoes recusa uma variacao enviada por engano.
 */
export async function resolveVariant(productId: string, variantId?: string | null) {
  const variants = await prisma.productVariant.findMany({
    where: { productId, active: true },
    orderBy: { position: 'asc' },
  });

  if (variants.length === 0) {
    if (variantId) throw badRequest('Este produto nao tem variacoes.', 'variant_not_applicable');
    return { variantId: NO_VARIANT, variant: null, variants };
  }

  if (!variantId) {
    throw badRequest('Escolha cor e tamanho antes de adicionar ao carrinho.', 'variant_required');
  }
  const variant = variants.find((v) => v.id === variantId);
  if (!variant) throw notFound('Variacao indisponivel.');
  return { variantId: variant.id, variant, variants };
}

/**
 * Remove uma variacao junto com a linha de estoque dela.
 *
 * Inventory.variantId nao tem chave estrangeira (a sentinela "" impede), entao
 * a limpeza e responsabilidade daqui — nao do banco.
 */
export async function deleteVariant(variantId: string) {
  await prisma.$transaction(async (tx) => {
    const reserved = await tx.stockReservation.count({
      where: { variantId, status: 'ACTIVE' },
    });
    if (reserved > 0) {
      throw badRequest(
        'Existem pedidos abertos com esta variacao. Conclua ou cancele antes de remove-la.',
        'variant_in_use',
      );
    }
    await tx.inventory.deleteMany({ where: { variantId } });
    await tx.cartItem.deleteMany({ where: { variantId } });
    await tx.productVariant.delete({ where: { id: variantId } });
  });
}

export type ProductVariantsPayload = Prisma.ProductVariantGetPayload<object>;
