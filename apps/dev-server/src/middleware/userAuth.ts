import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import type { AuthenticatedRequest } from './auth.js';

// Authenticate portal users via Supabase JWT (Authorization: Bearer <token>)
export async function userAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'];
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.userId = data.user.id;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}


