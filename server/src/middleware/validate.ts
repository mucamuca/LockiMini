import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

type Source = 'body' | 'query' | 'params';

/** Valida e SUBSTITUI a fonte pelos dados ja tipados/coeridos pelo Zod. */
export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    if (source === 'query') {
      (req as unknown as Record<string, unknown>).validatedQuery = result.data;
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

/** Acessa o resultado de validate(schema, 'query') com tipagem. */
export function q<T>(req: Request): T {
  return (req as unknown as { validatedQuery: T }).validatedQuery;
}
