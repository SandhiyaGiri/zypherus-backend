import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino();

export interface ApiError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error details
  logger.error({
    err,
    path: req.path,
    method: req.method,
    ip: req.ip,
  }, 'Request error');

  // Determine status code
  const statusCode = err.statusCode || 500;
  
  // Don't leak internal errors in production
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: message,
    ...(err.details && { details: err.details }),
  });
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
