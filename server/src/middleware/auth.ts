import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { ACCESS_COOKIE, verifyAccessToken, type JwtPayload } from '../lib/tokens.js';
import { forbidden, unauthorized } from '../http/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  return cookie ?? null;
}

/**
 * Popula req.user quando ha credencial valida, mas nunca bloqueia.
 *
 * A assinatura do JWT prova que o token foi emitido por nos — nao que a conta
 * ainda existe. Uma conta apagada ou desativada deixaria um token valido em
 * circulacao ate expirar, e qualquer escrita com aquele userId estouraria a
 * chave estrangeira. Por isso conferimos a conta no banco: e uma busca por
 * chave primaria, e em troca desativar um usuario tem efeito imediato e uma
 * mudanca de papel nao espera o token vencer.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return next();

  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(); // expirado ou adulterado: segue como visitante
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, active: true },
    });
    if (user?.active) {
      // O papel vem do banco, nao do token: quem perdeu o admin perde agora.
      req.user = { sub: user.id, email: user.email, role: user.role };
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized('Faca login para continuar.'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized('Faca login para continuar.'));
  if (req.user.role !== 'ADMIN') return next(forbidden('Area restrita a administradores.'));
  next();
}
