import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import crypto from 'node:crypto';

const logger = pino();

export function requestLogger(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      requestId,
      apiKey: (req as any).apiKey?.slice(0, 10) + '...',
    }, 'HTTP Request');
  });
  
  next();
}
