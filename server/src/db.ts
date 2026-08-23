import { Prisma, PrismaClient } from '@prisma/client';
import { env } from './env.js';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Transacoes de escrita disputam o mesmo arquivo no SQLite: damos folga. */
export const TX_OPTIONS = { timeout: 20_000, maxWait: 15_000 } as const;

/**
 * SQLite so aceita um escritor por vez. Sem WAL, qualquer leitura concorrente
 * bloqueia a escrita e o checkout estoura por timeout debaixo de carga.
 * WAL + busy_timeout resolvem isso sem mudar uma linha da regra de negocio.
 */
export async function initDatabase() {
  if (!env.DATABASE_URL.startsWith('file:')) return;
  // $queryRawUnsafe e nao $executeRawUnsafe: alguns PRAGMAs devolvem uma linha
  // com o valor aplicado, e o SQLite recusa isso num "execute".
  // journal_mode fica gravado no proprio arquivo; os demais valem por conexao,
  // por isso a URL usa connection_limit=1 (ver .env).
  for (const pragma of [
    'PRAGMA journal_mode = WAL;',
    'PRAGMA busy_timeout = 10000;',
    'PRAGMA synchronous = NORMAL;',
    'PRAGMA foreign_keys = ON;',
  ]) {
    try {
      await prisma.$queryRawUnsafe(pragma);
    } catch (err) {
      console.warn(`[db] nao foi possivel aplicar "${pragma}"`, err);
    }
  }
}

/** Erros de contencao — nao sao culpa da requisicao, so azar de timing. */
const CONTENTION_CODES = new Set(['P1008', 'P2034', 'P2024']);

export function isContentionError(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return CONTENTION_CODES.has(err.code);
  const message = err instanceof Error ? err.message : String(err);
  return /database is locked|SQLITE_BUSY|Timed out fetching a new connection/i.test(message);
}

/**
 * Reexecuta a operacao quando o banco estava ocupado.
 *
 * So faz sentido para blocos idempotentes ate o commit: se a transacao falhou
 * por lock, nada dela foi aplicado, entao repetir e seguro.
 */
export async function withWriteRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isContentionError(err)) throw err;
      lastError = err;
      // Espera crescente com ruido, para as tentativas nao colidirem de novo.
      const backoff = 40 * 2 ** (attempt - 1) + Math.random() * 60;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastError;
}

export { Prisma };
