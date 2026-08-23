import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Regra minima: 8+ caracteres, com letra e numero. */
export function passwordIssues(plain: string): string | null {
  if (plain.length < 8) return 'A senha precisa ter ao menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(plain)) return 'A senha precisa conter ao menos uma letra.';
  if (!/[0-9]/.test(plain)) return 'A senha precisa conter ao menos um numero.';
  return null;
}
