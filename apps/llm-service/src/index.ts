import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import cors from 'cors';
import express, { type Express, type Response } from 'express';
import pino from 'pino';
import { DataPacket_Kind, RoomServiceClient } from 'livekit-server-sdk';
import { groq } from '@ai-sdk/groq';
import { streamText } from 'ai';
import { z } from 'zod';
import {
  CorrectionRequestPayload,
  CorrectionStreamDelta,
  DEFAULT_LLM_MODEL,
  TRANSCRIPT_CHANNEL_LABEL,
} from '@zypherus/shared-types';
import { buildMessages } from '@zypherus/prompt-kit';

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
  LLM_SERVICE_PORT: z.coerce.number().default(4300),
  GROQ_API_KEY: z.string().min(1),
  GROQ_LLM_MODEL: z.string().default(DEFAULT_LLM_MODEL),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  LIVEKIT_HOST: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
});

type Env = z.infer<typeof envSchema>;

const requestSchema = z.object({
  requestId: z.string().min(1),
  roomName: z.string().min(1),
  targetIdentities: z.array(z.string()).optional(),
  batch: z.object({
    batchId: z.string(),
    segments: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        startMs: z.number(),
        endMs: z.number(),
        isFinal: z.boolean(),
        revision: z.number(),
        source: z.string(),
        createdAt: z.string(),
        confidence: z.number().optional(),
        correctedFromId: z.string().optional(),
      }),
    ),
    isFinal: z.boolean(),
    receivedAt: z.string(),
  }),
  context: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
      isFinal: z.boolean(),
      revision: z.number(),
      source: z.string(),
      createdAt: z.string(),
      confidence: z.number().optional(),
      correctedFromId: z.string().optional(),
    }),
  ),
  language: z.string().optional(),
  domainHint: z.string().optional(),
  terminology: z.array(z.string()).optional(),
});

function parseEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    logger.error({ err: error }, 'Invalid LLM service environment');
    throw error;
  }
}

function flushResponse(res: Response) {
  (res as Response & { flush?: () => void }).flush?.();
}

export function createServer(): { app: Express; env: Env } {
  const env = parseEnv();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const roomService = new RoomServiceClient(
    env.LIVEKIT_HOST,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/v1/corrections/stream', async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data as CorrectionRequestPayload;

    const { system, user } = buildMessages({
      batch: payload.batch,
      context: payload.context,
      options: {
        allowPartial: true,
        instructions:
          [
            'Only return the corrected text for the latest chunk. Do not restate content that already appears in the prior context. Avoid repeating phrases or sentences. Keep output minimal and non-redundant. Output complete sentences only - do not cut off mid-sentence. Fix grammar and merge broken sentences.',
            payload.language ? `Respond in ${payload.language}.` : undefined,
          ]
            .filter(Boolean)
            .join(' '),
        domainHint: payload.domainHint,
        terminology: payload.terminology,
      },
    });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullText = '';
    try {
      const result = await streamText({
        model: groq(env.GROQ_LLM_MODEL),
        temperature: env.LLM_TEMPERATURE,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      for await (const part of result.textStream) {
        fullText += part;
        const delta: CorrectionStreamDelta = {
          requestId: payload.requestId,
          roomName: payload.roomName,
          text: fullText,
          isFinal: false,
        };

        await broadcastDelta({
          delta,
          roomService,
          targetIdentities: payload.targetIdentities,
        });

        res.write(`data: ${JSON.stringify({ ...delta, part })}\n\n`);
        // Flush if available (compression disabled).
        flushResponse(res);
      }

      const finalDelta: CorrectionStreamDelta = {
        requestId: payload.requestId,
        roomName: payload.roomName,
        text: fullText.trim(),
        isFinal: true,
      };

      await broadcastDelta({
        delta: finalDelta,
        roomService,
        targetIdentities: payload.targetIdentities,
      });

      res.write(`data: ${JSON.stringify({ ...finalDelta, final: true })}\n\n`);
      flushResponse(res);
      res.write('event: end\n\n');
      res.end();
    } catch (error) {
      logger.error({ err: error }, 'Failed to stream correction');
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'LLM failure' })}\n\n`);
      flushResponse(res);
      res.end();
    }
  });

  return { app, env };
}

interface BroadcastDeltaParams {
  delta: CorrectionStreamDelta;
  roomService: RoomServiceClient;
  targetIdentities?: string[];
}

async function broadcastDelta({
  delta,
  roomService,
  targetIdentities,
}: BroadcastDeltaParams) {
  const payload = Buffer.from(
    JSON.stringify({
      type: 'correction',
      payload: delta,
    }),
  );

  await roomService.sendData(delta.roomName, payload, DataPacket_Kind.RELIABLE, {
    topic: TRANSCRIPT_CHANNEL_LABEL,
    destinationIdentities: targetIdentities,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, env } = createServer();
  app.listen(env.LLM_SERVICE_PORT, () => {
    logger.info({ port: env.LLM_SERVICE_PORT }, 'LLM service listening');
  });
}
