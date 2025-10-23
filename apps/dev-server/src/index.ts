import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import cors from 'cors';
import express, { type Express, type Response } from 'express';
import pino from 'pino';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { z } from 'zod';
import type { LiveKitJoinPayload } from '@zypherus/shared-types';

// Import middleware
import { apiKeyAuth, type AuthenticatedRequest } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { usageLogger } from './middleware/usageLogger.js';
import portalRoutes from './routes/portal.js';
import { userAuth } from './middleware/userAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '../../..');

const envCandidates = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(appRoot, '.env'),
  path.join(appRoot, '.env.local'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: true });
  }
}

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      translateTime: 'SYS:standard',
      colorize: true,
    },
  },
});

const envSchema = z.object({
  DEV_SERVER_PORT: z.coerce.number().default(4000),
  LIVEKIT_HOST: z.string().url(),
  LIVEKIT_WS_URL: z.string().url(),
  LIVEKIT_WS_URL_FRONTEND: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
});

type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    logger.error({ err: error }, 'Invalid environment configuration');
    throw error;
  }
}

const tokenRequestSchema = z.object({
  roomName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/),
  identity: z.string().min(1).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  autoCreate: z.boolean().optional(),
});

export function createDevServer(): { app: Express; env: Env } {
  const env = parseEnv();
  const app = express();
  
  // Middleware setup
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(requestLogger);
  app.use(usageLogger);

  const roomService = new RoomServiceClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Portal routes
  // Public: signup/login
  app.use('/api', portalRoutes);
  
  // Rate limiting for authenticated routes
  const rateLimiter = createRateLimiter();
  
  app.post('/livekit/token', apiKeyAuth, rateLimiter, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = tokenRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid payload', details: parseResult.error.flatten() });
      return;
    }

    const { roomName, identity: identityInput, autoCreate, metadata } = parseResult.data;
    const identity = identityInput ?? `web-${crypto.randomUUID()}`;

    if (autoCreate) {
      try {
        await roomService.createRoom({ name: roomName });
      } catch (error) {
        logger.warn({ err: error, roomName }, 'Failed to create room (may already exist)');
      }
    }

    const token = await buildAccessToken({
      roomName,
      identity,
      apiKey: env.LIVEKIT_API_KEY,
      apiSecret: env.LIVEKIT_API_SECRET,
      metadata,
    });

    const payload: LiveKitJoinPayload = {
      url: env.LIVEKIT_WS_URL_FRONTEND ?? env.LIVEKIT_WS_URL,
      token,
      roomName,
      identity,
    };

    res.json(payload);
  }));

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return { app, env };
}

interface BuildAccessTokenOptions {
  roomName: string;
  identity: string;
  apiKey: string;
  apiSecret: string;
  ttlSeconds?: number;
  metadata?: Record<string, unknown>;
}

async function buildAccessToken(options: BuildAccessTokenOptions) {
  const { roomName, identity, apiKey, apiSecret, ttlSeconds = 60 * 60, metadata } = options;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: ttlSeconds,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, env } = createDevServer();
  app.listen(env.DEV_SERVER_PORT, () => {
    logger.info({ port: env.DEV_SERVER_PORT }, 'Dev server listening');
  });
}
