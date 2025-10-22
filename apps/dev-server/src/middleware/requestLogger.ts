import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino();

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      apiKey: (req as any).apiKey?.slice(0, 10) + '...',
    }, 'HTTP Request');
  });
  
  next();
}
