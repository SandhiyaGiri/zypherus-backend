import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import type { AuthenticatedRequest } from './auth.js';

interface UsageLogEntry {
  api_key_id: string;
  user_id: string;
  endpoint: string;
  status_code: number;
  timestamp: string;
  ip_address: string;
}

// Batch usage logs for performance
const usageLogBatch: UsageLogEntry[] = [];
const BATCH_SIZE = 10;
const BATCH_INTERVAL = 10000; // 10 seconds

export function usageLogger(req: AuthenticatedRequest & { requestId?: string }, res: Response, next: NextFunction) {
  const originalSend: (this: Response, body?: any) => Response = res.send;
  
  res.send = function(this: Response, body?: any) {
    try {
      // Log usage after response is sent
      if (req.apiKey && req.userId && req.apiKeyData) {
        const logEntry: UsageLogEntry = {
          api_key_id: req.apiKeyData.id,
          user_id: req.userId,
          endpoint: req.originalUrl,
          status_code: res.statusCode,
          timestamp: new Date().toISOString(),
          ip_address: req.ip || req.socket.remoteAddress || 'unknown',
        };
        
        usageLogBatch.push(logEntry);
        
        // Flush batch if it reaches the size limit
        if (usageLogBatch.length >= BATCH_SIZE) {
          flushUsageLogs();
        }
      }
    } finally {
      return originalSend.call(this, body);
    }
  } as unknown as typeof res.send;
  
  next();
}

// Flush usage logs to database
async function flushUsageLogs() {
  if (usageLogBatch.length === 0) return;
  
  const logsToInsert = [...usageLogBatch];
  usageLogBatch.length = 0; // Clear the batch
  
  try {
    const { error } = await supabase
      .from('usage_logs')
      .insert(logsToInsert);
    
    if (error) {
      console.error('Failed to insert usage logs:', error);
    }
  } catch (error) {
    console.error('Usage logging error:', error);
  }
}

// Flush logs periodically
setInterval(flushUsageLogs, BATCH_INTERVAL);

// Flush logs on process exit
process.on('SIGINT', flushUsageLogs);
process.on('SIGTERM', flushUsageLogs);
