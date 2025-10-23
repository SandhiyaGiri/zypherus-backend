import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino();

export interface ApiError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function errorHandler(
  err: ApiError,
  req: Request & { requestId?: string },
  res: Response,
  next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  const requestId = req.requestId || (req.headers['x-request-id'] as string | undefined);

  logger.error({
    err,
    path: req.path,
    method: req.method,
    ip: req.ip,
    requestId,
  }, 'Request error');

  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  const payload: { error: { code: number; message: string; details?: unknown; requestId?: string } } = {
    error: {
      code: statusCode,
      message,
    },
  };
  if (typeof err.details !== 'undefined') {
    payload.error.details = err.details;
  }
  if (requestId) {
    payload.error.requestId = requestId;
  }
  res.status(statusCode).json(payload);
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error: unknown) => {
      // Normalize Zod errors
      if (typeof error === 'object' && error !== null && 'issues' in (error as any)) {
        const zodErr = error as any;
        const apiError: ApiError = new Error('Invalid payload');
        apiError.statusCode = 400;
        apiError.details = zodErr.flatten ? zodErr.flatten() : zodErr.issues;
        return next(apiError);
      }
      return next(error as any);
    });
  };
}
