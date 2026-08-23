import type { OrderStatus } from './types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (cents: number) => brl.format((cents ?? 0) / 100);

export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

/**
 * Formata uma data curta. Aceita ISO completo ou "YYYY-MM-DD".
 * O segundo caso e tratado como data de calendario local: `new Date('2026-08-22')`
 * seria meia-noite UTC e, a oeste de Greenwich, apareceria como dia 21.
 */
export const dateOnly = (iso: string) => {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(iso);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
};

/** "ha 5 minutos", "ontem" — mais legivel que timestamp em listas. */
export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; className: string; dot: string }> = {
  PENDING_PAYMENT: {
    label: 'Aguardando pagamento',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    dot: 'bg-amber-500',
  },
  PAID: { label: 'Pago', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  PROCESSING: { label: 'Em separacao', className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200', dot: 'bg-sky-500' },
  SHIPPED: { label: 'Enviado', className: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200', dot: 'bg-indigo-500' },
  DELIVERED: { label: 'Entregue', className: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200', dot: 'bg-teal-500' },
  CANCELLED: { label: 'Cancelado', className: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200', dot: 'bg-ink-400' },
  REFUNDED: { label: 'Estornado', className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200', dot: 'bg-rose-500' },
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  credit_card: 'Cartao de credito',
  pix: 'Pix',
  boleto: 'Boleto bancario',
};

export const STOCK_REASON_LABEL: Record<string, string> = {
  PURCHASE_ORDER: 'Entrada de compra',
  SALE: 'Venda',
  CANCELLATION: 'Cancelamento',
  RETURN: 'Devolucao',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  LOSS: 'Perda',
};

/** Mascara de CEP conforme o usuario digita. */
export function maskPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function maskCardNumber(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export function installmentLabel(totalCents: number, installments: number) {
  if (installments <= 1) return `A vista — ${money(totalCents)}`;
  return `${installments}x de ${money(Math.round(totalCents / installments))} sem juros`;
}
