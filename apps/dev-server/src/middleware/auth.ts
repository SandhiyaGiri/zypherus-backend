import { Request, Response, NextFunction } from 'express';
import { supabase, type ApiKey } from '../lib/supabase.js';

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
  userId?: string;
  apiKeyData?: ApiKey;
}

// Cache for valid API keys with TTL
interface CachedApiKey {
  data: ApiKey;
  expiresAt: number;
}

const apiKeyCache = new Map<string, CachedApiKey>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({ error: 'Missing API key' });
  }

  // Validate API key format
  if (!isValidApiKeyFormat(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key format' });
  }

  try {
    // Check cache first
    const cached = apiKeyCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
      req.apiKey = apiKey;
      req.userId = cached.data.user_id;
      req.apiKeyData = cached.data;
      return next();
    }

    // Query database for API key
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key', apiKey)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Cache the result
    apiKeyCache.set(apiKey, {
      data,
      expiresAt: Date.now() + CACHE_TTL,
    });

    // Update last_used_at
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    req.apiKey = apiKey;
    req.userId = data.user_id;
    req.apiKeyData = data;
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function isValidApiKeyFormat(key: string): boolean {
  return /^zk_[a-zA-Z0-9]{32}$/.test(key);
}

// Function to invalidate cache when API key is revoked
export function invalidateApiKeyCache(apiKey: string) {
  apiKeyCache.delete(apiKey);
}

// Cleanup expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, cached] of apiKeyCache.entries()) {
    if (cached.expiresAt <= now) {
      apiKeyCache.delete(key);
    }
  }
}, CACHE_TTL);
