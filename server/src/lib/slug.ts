export function slugify(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function orderNumber(seq: number) {
  const year = new Date().getFullYear();
  return `LK-${year}-${String(seq).padStart(6, '0')}`;
}
