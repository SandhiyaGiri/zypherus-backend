import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Per API key/IP rate limiter with env-driven defaults
export function createRateLimiter() {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000);
  const defaultLimit = Number(process.env.DEFAULT_RATE_LIMIT ?? 60);

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const now = Date.now();
    const identifier = req.apiKeyData?.id ?? (req.ip || req.socket.remoteAddress || 'unknown');
    const limit = req.apiKeyData?.rate_limit ?? defaultLimit;

    let entry = rateLimitStore.get(identifier);

    // Reset if window expired
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
      rateLimitStore.set(identifier, entry);
    }

    entry.count++;

    // Check limit
    if (entry.count > limit) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        limit,
        current: entry.count,
      });
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    next();
  };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt + 60000) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);
