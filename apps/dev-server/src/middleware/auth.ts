import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
  clientId?: string;
}

export function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({ error: 'Missing API key' });
  }

  // Validate API key format (simple check)
  if (!isValidApiKeyFormat(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key format' });
  }

  // Store for rate limiter and logging
  req.apiKey = apiKey;
  req.clientId = extractClientId(apiKey);
  next();
}

function isValidApiKeyFormat(key: string): boolean {
  return /^zk_[a-zA-Z0-9]{32}$/.test(key);
}

function extractClientId(key: string): string {
  return key.slice(0, 16); // Use prefix for grouping
}
