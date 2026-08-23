export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'error',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (m: string, code = 'bad_request', d?: unknown) => new AppError(400, m, code, d);
export const unauthorized = (m = 'Nao autenticado.') => new AppError(401, m, 'unauthorized');
export const forbidden = (m = 'Acesso negado.') => new AppError(403, m, 'forbidden');
export const notFound = (m = 'Recurso nao encontrado.') => new AppError(404, m, 'not_found');
export const conflict = (m: string, code = 'conflict', d?: unknown) => new AppError(409, m, code, d);
export const unprocessable = (m: string, code = 'unprocessable', d?: unknown) => new AppError(422, m, code, d);
