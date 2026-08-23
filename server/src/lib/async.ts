import type { NextFunction, Request, Response } from 'express';

/** Encaminha rejeicoes de handlers async para o middleware de erro do Express 4. */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
