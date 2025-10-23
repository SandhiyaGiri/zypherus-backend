import { Router } from 'express';
import type { Request, Response, Router as ExpressRouter } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { userAuth } from '../middleware/userAuth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router: ExpressRouter = Router();
const rateLimiter = createRateLimiter();

// Auth schemas
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const apiKeySchema = z.object({
  name: z.string().min(1).max(100),
  rate_limit: z.number().min(1).max(10000).optional(),
});

// Limit: prevent too many key creations per user in a time window
const MAX_KEYS_PER_DAY = Number(process.env.MAX_KEYS_PER_DAY ?? 10);

// Generate API key matching validator: /^zk_[a-zA-Z0-9]{32}$/
function generateApiKey(): string {
  const prefix = 'zk_';
  const length = 32;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let body = '';
  for (let i = 0; i < length; i++) {
    body += alphabet[bytes[i] % alphabet.length];
  }
  return prefix + body;
}

async function ensureUserProfile(userId: string): Promise<void> {
  // If user profile doesn't exist (e.g., user signed up via client SDK), create it
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existing?.id) return;

  // Fetch user from Supabase Auth
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  let email = authUser?.user?.email ?? null;
  if (!email) {
    // Fallback to a placeholder to satisfy NOT NULL constraint
    email = `${userId}@placeholder.local`;
  }

  // Best-effort insert; ignore unique violations
  try {
    await supabase
      .from('users')
      .insert({ id: userId, email, full_name: null });
  } catch {
    // ignore
  }
}

// Customer Authentication Routes
router.post('/auth/signup', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, full_name } = signupSchema.parse(req.body);
  
  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });
  
  if (authError) {
    return res.status(400).json({ error: authError.message });
  }
  
  if (!authData.user) {
    return res.status(400).json({ error: 'Failed to create user' });
  }
  
  // Create user profile
  const { error: profileError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      full_name: full_name || null,
      is_admin: false,
    });
  
  if (profileError) {
    return res.status(400).json({ error: 'Failed to create user profile' });
  }
  
  res.json({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      full_name: full_name || null,
    },
    session: authData.session,
  });
}));

router.post('/auth/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    return res.status(401).json({ error: error.message });
  }
  
  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();
  
  res.json({
    user: profile,
    session: data.session,
  });
}));

// API Key Management Routes
router.get('/keys', userAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Ensure profile row exists to satisfy FK on api_keys.user_id
  await ensureUserProfile(req.userId);
  
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false });
  
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch API keys' });
  }
  
  res.json({ keys: data });
}));

router.post('/keys', userAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { name, rate_limit = 60 } = apiKeySchema.parse(req.body);

  // Ensure profile row exists to satisfy FK on api_keys.user_id
  await ensureUserProfile(req.userId);
  
  // Enforce per-user daily key creation cap
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.userId)
    .gte('created_at', since);
  if (countError) {
    return res.status(500).json({ error: 'Failed to validate rate limit' });
  }
  if ((count ?? 0) >= MAX_KEYS_PER_DAY) {
    return res.status(429).json({ error: `API key creation limit reached (${MAX_KEYS_PER_DAY}/day)` });
  }
  const key = generateApiKey();
  
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: req.userId,
      key,
      name,
      rate_limit,
    })
    .select()
    .single();
  
  if (error) {
    if ((error as any).code === '23505') { // unique_violation
      return res.status(409).json({ error: 'An API key with this name already exists' });
    }
    // Provide clearer hint when FK fails (users row missing)
    if ((error as any).code === '23503') {
      return res.status(500).json({ error: 'User profile missing. Please try again or contact support.' });
    }
    return res.status(500).json({ error: 'Failed to create API key' });
  }
  
  res.json({ key: data });
}));

// Alias: generate API key (for external callers expecting /api/generate-key)
router.post('/generate-key', userAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Reuse the same body schema/logic as /keys
  const { name, rate_limit = 60 } = apiKeySchema.parse(req.body);

  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.userId)
    .gte('created_at', since);
  if (countError) {
    return res.status(500).json({ error: 'Failed to validate rate limit' });
  }
  if ((count ?? 0) >= MAX_KEYS_PER_DAY) {
    return res.status(429).json({ error: `API key creation limit reached (${MAX_KEYS_PER_DAY}/day)` });
  }

  const key = generateApiKey();
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: req.userId,
      key,
      name,
      rate_limit,
    })
    .select()
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      return res.status(409).json({ error: 'An API key with this name already exists' });
    }
    return res.status(500).json({ error: 'Failed to create API key' });
  }

  res.json({ key: data });
}));

// Validate API key and return status, remaining rate limit, etc.
router.post('/validate-key', rateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const apiKeyHeader = (req.headers['x-api-key'] || req.headers['authorization']) as string | undefined;
  const apiKey = typeof apiKeyHeader === 'string' && apiKeyHeader.startsWith('Bearer ')
    ? apiKeyHeader.slice('Bearer '.length)
    : apiKeyHeader;

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ valid: false, error: 'Missing API key' });
  }

  // Validate format first
  const isValidFormat = /^zk_[a-zA-Z0-9]{32}$/.test(apiKey);
  if (!isValidFormat) {
    return res.status(200).json({ valid: false, error: 'Invalid API key format' });
  }

  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key', apiKey)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return res.status(200).json({ valid: false, error: 'API key not found or inactive' });
  }

  // Touch last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  // Exclude sensitive key string in response
  const { key, ...rest } = data as any;

  // Include rate limit headers in response body for convenience
  const limit = res.getHeader('X-RateLimit-Limit');
  const remaining = res.getHeader('X-RateLimit-Remaining');
  const reset = res.getHeader('X-RateLimit-Reset');

  res.json({
    valid: true,
    key: { ...rest },
    rateLimit: {
      limit: typeof limit === 'string' ? Number(limit) : limit,
      remaining: typeof remaining === 'string' ? Number(remaining) : remaining,
      reset: typeof reset === 'string' ? Number(reset) : reset,
    },
  });
}));

router.delete('/keys/:id', userAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { id } = req.params;
  
  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', req.userId);
  
  if (error) {
    return res.status(500).json({ error: 'Failed to revoke API key' });
  }
  
  res.json({ success: true });
}));

// Usage Statistics
router.get('/usage', userAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { data, error } = await supabase
    .from('usage_logs')
    .select('*')
    .eq('user_id', req.userId)
    .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days
  
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch usage data' });
  }
  
  // Calculate statistics
  const totalRequests = data.length;
  const successfulRequests = data.filter((log: { status_code: number }) => log.status_code < 400).length;
  const errorRate = totalRequests > 0 ? (totalRequests - successfulRequests) / totalRequests : 0;
  
  // Group by day
  const dailyUsage = data.reduce((acc: Record<string, number>, log: { timestamp: string }) => {
    const date = log.timestamp.split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  res.json({
    total_requests: totalRequests,
    successful_requests: successfulRequests,
    error_rate: errorRate,
    daily_usage: dailyUsage,
  });
}));

// Admin Routes
router.get('/admin/users', userAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Check if user is admin
  const { data: user } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', req.userId)
    .single();
  
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
  
  res.json({ users: data });
}));

router.get('/admin/usage', userAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Check if user is admin
  const { data: user } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', req.userId)
    .single();
  
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const { data, error } = await supabase
    .from('usage_logs')
    .select('*')
    .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch usage data' });
  }
  
  // Calculate system-wide statistics
  const totalRequests = data.length;
  const successfulRequests = data.filter((log: { status_code: number }) => log.status_code < 400).length;
  const errorRate = totalRequests > 0 ? (totalRequests - successfulRequests) / totalRequests : 0;
  
  // Top users by requests
  const userStats = data.reduce((acc: Record<string, number>, log: { user_id: string }) => {
    acc[log.user_id] = (acc[log.user_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topUsers = Object.entries(userStats)
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, 10);
  
  res.json({
    total_requests: totalRequests,
    successful_requests: successfulRequests,
    error_rate: errorRate,
    top_users: topUsers,
  });
}));

export default router;
