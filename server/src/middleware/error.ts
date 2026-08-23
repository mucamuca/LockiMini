import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../http/errors.js';
import { isContentionError } from '../db.js';
import { isProd } from '../env.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Rota nao encontrada.' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Dados invalidos.', details: err.flatten().fieldErrors },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'duplicate', message: 'Ja existe um registro com esses dados.', details: err.meta },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Registro nao encontrado.' } });
    }
  }

  if (isContentionError(err)) {
    return res.status(503).json({
      error: {
        code: 'busy',
        message: 'O sistema esta processando muitos pedidos agora. Tente novamente em instantes.',
      },
    });
  }

  console.error('[erro nao tratado]', err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Erro interno do servidor.',
      details: isProd ? undefined : String(err instanceof Error ? err.stack : err),
    },
  });
}
