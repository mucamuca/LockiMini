/** Todo valor monetario trafega em centavos (inteiro) para evitar erro de float. */
export const toCents = (value: number) => Math.round(value * 100);
export const fromCents = (cents: number) => cents / 100;

export function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
