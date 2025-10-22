import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Simple in-memory rate limiter
export function createRateLimiter(options: {
  windowMs: number;  // 60000 = 1 minute
  maxRequests: number;  // e.g., 60 requests per minute
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = getClientIdentifier(req);
    const now = Date.now();
    
    let entry = rateLimitStore.get(identifier);
    
    // Reset if window expired
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + options.windowMs,
      };
      rateLimitStore.set(identifier, entry);
    }
    
    entry.count++;
    
    // Check limit
    if (entry.count > options.maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
    
    next();
  };
}

function getClientIdentifier(req: Request): string {
  // Use IP address (with proxy support)
  return req.ip || req.socket.remoteAddress || 'unknown';
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
