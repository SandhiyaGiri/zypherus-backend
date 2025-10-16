import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { config as loadEnv } from 'dotenv';
import pino from 'pino';
import Groq, { toFile } from 'groq-sdk';
import {
  Room,
  RoomEvent,
  RemoteAudioTrack,
  TrackKind,
  AudioFrame,
  AudioStream,
} from '@livekit/rtc-node';
import {
  AccessToken,
  DataPacket_Kind,
  RoomServiceClient,
} from 'livekit-server-sdk';
import { z } from 'zod';
import {
  AudioChunk,
  CorrectionRequestPayload,
  DEFAULT_GROQ_MODEL,
  TRANSCRIPT_CHANNEL_LABEL,
  TranscriptBatch,
  TranscriptSegment,
  TranscriptUpdate,
  TranscriptMetricsEvent,
} from '@zypherus/shared-types';
import {
  SlidingWindowConfig,
  SlidingWindowState,
  buildChunk,
  calculateSamples,
  convertAudioFormat,
  createEmptyState,
  processSamples,
} from '@zypherus/audio-utils';

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
  LIVEKIT_WS_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  LIVEKIT_HOST: z.string().url(),
  STT_ROOM_NAME: z.string().default('zypherus-demo'),
  STT_PARTICIPANT_IDENTITY: z.string().default('stt-worker'),
  GROQ_API_KEY: z.string().min(1),
  GROQ_STT_MODEL: z.string().default('whisper-large-v3-turbo'), // Use the most accurate model
  STT_WINDOW_MS: z.coerce.number().default(3000), // Longer window for better context
  STT_STRIDE_MS: z.coerce.number().default(1000), // Shorter stride for more frequent updates
  STT_TARGET_CHANNELS: z.coerce.number().int().default(1),
  STT_SAMPLE_RATE: z.coerce.number().int().default(16000),
  STT_LANGUAGE: z.string().default('en'), // Default to English for better accuracy
  LLM_SERVICE_URL: z.string().url().default('http://localhost:4300'),
  LLM_TARGET_IDENTITIES: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((v) => v.trim()) : undefined)),
  STT_SILENCE_RMS_THRESHOLD: z.coerce.number().default(600),
  STT_GAIN_TARGET_RMS: z.coerce.number().default(1500),
  STT_GAIN_MAX: z.coerce.number().default(3),
  STT_GAIN_MIN: z.coerce.number().default(0.5),
  STT_GAIN_SMOOTHING: z.coerce.number().min(0).max(1).default(0.2),
  STT_VAD_WINDOW_MS: z.coerce.number().default(600),
  STT_VAD_SENSITIVITY: z.coerce.number().min(0).max(1).default(0.5),
  STT_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.45),
  STT_DEFAULT_DOMAIN_HINT: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  STT_DEFAULT_TERMINOLOGY: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }
      const items = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return items.length > 0 ? items : undefined;
    }),
  STT_DEFAULT_PROMPT: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  STT_TEMPERATURE: z.coerce.number().min(0).max(1).default(0),
});

type Env = z.infer<typeof envSchema>;

interface TrackContext {
  state: SlidingWindowState;
  config: SlidingWindowConfig;
  nextTimestampMs: number;
  participantIdentity: string;
  sampleRateWarned: boolean;
  channelWarned: boolean;
  rmsAverage: number;
  gain: number;
  noiseFloor: number;
  vadAccumulator: number[];
  language?: string;
  domainHint?: string;
  terminology?: string[];
  prompt?: string;
}

const trackContexts = new Map<string, TrackContext>();
const transcriptHistory: TranscriptSegment[] = [];
let lastBroadcastedText = ''; // Track cumulative broadcasted text to avoid repetition
let totalChunksProcessed = 0; // Track total chunks for debugging
let totalChunksSkipped = 0; // Track skipped chunks due to deduplication
let sentenceBuffer = ''; // Buffer incomplete sentences until punctuation boundary
let sentenceConfidence = 1;

const GROQ_SUPPORTED_LANGUAGES = new Set<string>([
  'af',
  'am',
  'ar',
  'as',
  'az',
  'ba',
  'be',
  'bg',
  'bn',
  'bo',
  'br',
  'bs',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'eu',
  'fa',
  'fi',
  'fo',
  'fr',
  'gl',
  'gu',
  'ha',
  'haw',
  'he',
  'hi',
  'hr',
  'ht',
  'hu',
  'hy',
  'id',
  'is',
  'it',
  'ja',
  'jv',
  'ka',
  'kk',
  'km',
  'kn',
  'ko',
  'la',
  'lb',
  'ln',
  'lo',
  'lt',
  'lv',
  'mg',
  'mi',
  'mk',
  'ml',
  'mn',
  'mr',
  'ms',
  'mt',
  'my',
  'ne',
  'nl',
  'nn',
  'no',
  'oc',
  'pa',
  'pl',
  'ps',
  'pt',
  'ro',
  'ru',
  'sa',
  'sd',
  'si',
  'sk',
  'sl',
  'sn',
  'so',
  'sq',
  'sr',
  'su',
  'sv',
  'sw',
  'ta',
  'te',
  'tg',
  'th',
  'tk',
  'tl',
  'tr',
  'tt',
  'uk',
  'ur',
  'uz',
  'vi',
  'yue',
  'yo',
  'yi',
  'zh',
]);

function normalizeLanguageCode(language?: string | null): string | undefined {
  if (!language) {
    return undefined;
  }

  const trimmed = language.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  if (GROQ_SUPPORTED_LANGUAGES.has(trimmed)) {
    return trimmed;
  }

  const base = trimmed.split(/[-_]/)[0];
  if (GROQ_SUPPORTED_LANGUAGES.has(base)) {
    return base;
  }

  return undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return Array.from(seen);
}

function parseEnv(): Env {
  try {
    const env = envSchema.parse(process.env);

    return {
      ...env,
      STT_DEFAULT_DOMAIN_HINT: env.STT_DEFAULT_DOMAIN_HINT ?? 'medical radiology reporting',
      STT_DEFAULT_TERMINOLOGY:
        env.STT_DEFAULT_TERMINOLOGY ?? ['CT', 'MRI', 'radiograph', 'lesion', 'contrast', 'nodule'],
      STT_DEFAULT_PROMPT:
        env.STT_DEFAULT_PROMPT ??
        'Accurately capture English medical radiology terminology and correct misheard phrases.',
    };
  } catch (error) {
    logger.error({ err: error }, 'Invalid STT worker environment');
    throw error;
  }
}

export async function startSttWorker() {
  const env = parseEnv();
  const groqClient = new Groq({ apiKey: env.GROQ_API_KEY });
  const roomService = new RoomServiceClient(
    env.LIVEKIT_HOST,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );

  const joinToken = await buildAccessToken({
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    identity: env.STT_PARTICIPANT_IDENTITY,
    roomName: env.STT_ROOM_NAME,
    canPublish: false,
    canSubscribe: true,
  });

  const room = new Room();
  logger.info('Connecting to LiveKit as STT worker');
  await room.connect(env.LIVEKIT_WS_URL, joinToken, { autoSubscribe: true, dynacast: true });

  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (track.kind !== TrackKind.KIND_AUDIO) {
      return;
    }

    logger.info({
      participant: participant.identity,
      trackSid: publication.sid,
    }, 'Audio track subscribed');

    const audioTrack = track as RemoteAudioTrack;
    const participantMetadata = safeParseMetadata(participant.metadata);
    const rawLanguage = participantMetadata?.locale ?? env.STT_LANGUAGE;
    const normalizedLanguage = normalizeLanguageCode(rawLanguage);
    if (rawLanguage && !normalizedLanguage) {
      logger.warn({ rawLanguage }, 'Unsupported language code received, defaulting to auto-detect');
    }

    const combinedTerminology = uniqueStrings([
      ...(env.STT_DEFAULT_TERMINOLOGY ?? []),
      ...(participantMetadata?.terminology ?? []),
    ]);
    const domainHint = participantMetadata?.domainHint ?? env.STT_DEFAULT_DOMAIN_HINT;
    const promptSegments = [
      env.STT_DEFAULT_PROMPT,
      domainHint ? `Context: ${domainHint}.` : undefined,
      combinedTerminology.length ? `Key medical terms: ${combinedTerminology.join(', ')}.` : undefined,
    ].filter(Boolean);
    const prompt = promptSegments.length > 0 ? promptSegments.join(' ').trim() : undefined;

    const context: TrackContext = {
      state: createEmptyState(
        calculateSamples(env.STT_SAMPLE_RATE, env.STT_WINDOW_MS, env.STT_TARGET_CHANNELS),
      ),
      config: {
        sampleRate: env.STT_SAMPLE_RATE,
        channels: env.STT_TARGET_CHANNELS,
        windowMs: env.STT_WINDOW_MS,
        strideMs: env.STT_STRIDE_MS,
        format: 's16le',
      },
      nextTimestampMs: Date.now(),
      participantIdentity: participant.identity ?? 'unknown-participant',
      sampleRateWarned: false,
      channelWarned: false,
      rmsAverage: env.STT_GAIN_TARGET_RMS,
      gain: 1,
      noiseFloor: env.STT_SILENCE_RMS_THRESHOLD,
      vadAccumulator: [],
      language: normalizedLanguage,
      domainHint,
      terminology: combinedTerminology.length > 0 ? combinedTerminology : undefined,
      prompt,
    };

    const trackSid = publication.sid ?? `track-${crypto.randomUUID()}`;
    trackContexts.set(trackSid, context);

    const stream = new AudioStream(audioTrack);
    (async () => {
      try {
        for await (const frame of stream) {
          await handleAudioFrame({
            frame,
            context,
            env,
            groqClient,
            roomService,
          }).catch((error) => {
            logger.error({ err: error }, 'Failed processing audio frame');
          });
        }
      } catch (error) {
        logger.warn({ err: error, trackSid }, 'Audio stream ended or participant disconnected');
      }
    })();
  });

  room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
    const trackSid = publication.sid ?? 'unknown-track';
    trackContexts.delete(trackSid);
    logger.info({ trackSid }, 'Audio track unsubscribed');
    
    // Reset transcription state when track ends
    if (trackContexts.size === 0) {
      logger.info({ 
        totalChunksProcessed, 
        totalChunksSkipped,
        deduplicationRate: totalChunksProcessed > 0 ? (totalChunksSkipped / totalChunksProcessed * 100).toFixed(1) + '%' : '0%'
      }, 'All tracks unsubscribed, resetting transcription state');
      lastBroadcastedText = '';
      transcriptHistory.length = 0;
      totalChunksProcessed = 0;
      totalChunksSkipped = 0;
      sentenceBuffer = '';
      sentenceConfidence = 1;
    }
  });

  room.on(RoomEvent.Disconnected, () => {
    logger.warn('Disconnected from LiveKit, attempting reconnect');
    // Reset state on disconnect
    lastBroadcastedText = '';
    transcriptHistory.length = 0;
    totalChunksProcessed = 0;
    totalChunksSkipped = 0;
    sentenceBuffer = '';
    sentenceConfidence = 1;
  });

  // Handle participant disconnections to avoid race conditions
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    logger.info({ identity: participant.identity }, 'Participant disconnected');
    // Reset state when participant leaves
    lastBroadcastedText = '';
    transcriptHistory.length = 0;
    totalChunksProcessed = 0;
    totalChunksSkipped = 0;
    sentenceBuffer = '';
    sentenceConfidence = 1;
  });

  // Global error handler for uncaught LiveKit errors
  process.on('uncaughtException', (error) => {
    if (error.message && error.message.includes('participant') && error.message.includes('not found')) {
      logger.warn({ err: error }, 'Participant not found (likely disconnected) - ignoring');
    } else {
      logger.error({ err: error }, 'Uncaught exception in STT worker');
      throw error;
    }
  });

  process.on('SIGINT', async () => {
    logger.info('STT worker shutting down');
    await room.disconnect();
    process.exit(0);
  });
}

interface HandleAudioFrameParams {
  frame: AudioFrame;
  context: TrackContext;
  env: Env;
  groqClient: Groq;
  roomService: RoomServiceClient;
}

async function handleAudioFrame({
  frame,
  context,
  env,
  groqClient,
  roomService,
}: HandleAudioFrameParams) {
  logger.debug(
    {
      sampleRate: frame.sampleRate,
      channels: frame.channels,
      samplesPerChannel: frame.samplesPerChannel,
      dataBytes: frame.data.byteLength,
      expectedSampleRate: env.STT_SAMPLE_RATE,
      expectedChannels: env.STT_TARGET_CHANNELS,
    },
    'Received audio frame',
  );

  if (frame.sampleRate !== env.STT_SAMPLE_RATE) {
    if (!context.sampleRateWarned) {
      context.sampleRateWarned = true;
      logger.warn(
        {
          received: frame.sampleRate,
          expected: env.STT_SAMPLE_RATE,
          action: 'resampling to expected rate',
        },
        'Sample rate mismatch detected',
      );
    }
  }

  if (frame.channels !== env.STT_TARGET_CHANNELS) {
    if (!context.channelWarned) {
      context.channelWarned = true;
      logger.warn(
        {
          received: frame.channels,
          expected: env.STT_TARGET_CHANNELS,
          action: 'remixing to expected channel count',
        },
        'Channel count mismatch detected',
      );
    }
  }

  // Convert raw frame data to Int16Array
  let samples = new Int16Array(
    frame.data.buffer,
    frame.data.byteOffset,
    frame.data.byteLength / Int16Array.BYTES_PER_ELEMENT,
  );

  // Convert audio format if needed (resample + channel conversion)
  if (frame.sampleRate !== env.STT_SAMPLE_RATE || frame.channels !== env.STT_TARGET_CHANNELS) {
    logger.debug(
      {
        converting: true,
        from: { rate: frame.sampleRate, channels: frame.channels },
        to: { rate: env.STT_SAMPLE_RATE, channels: env.STT_TARGET_CHANNELS },
      },
      'Converting audio format',
    );
    samples = convertAudioFormat(
      samples,
      frame.channels,
      frame.sampleRate,
      env.STT_TARGET_CHANNELS,
      env.STT_SAMPLE_RATE,
    );
  }

  if (env.STT_GAIN_TARGET_RMS > 0) {
    samples = applyGainControl(samples, context, env);
  }

  const now = Date.now();
  const timestamp = context.nextTimestampMs ?? now - env.STT_WINDOW_MS;

  const results = processSamples(
    context.state,
    samples,
    context.config,
    chunkFactory,
    timestamp,
  );

  if (results.length === 0) {
    return;
  }

  for (const { chunk } of results) {
    context.nextTimestampMs = chunk.metadata.startMs + env.STT_STRIDE_MS;
    await processChunk({
      chunk,
      env,
      groqClient,
      roomService,
      context,
    });
    await delay(0);
  }
}

function chunkFactory(payload: Int16Array, metadata: AudioChunk['metadata']): AudioChunk {
  const copied = new Int16Array(payload); // ensure buffer independence
  return buildChunk(copied, metadata);
}

interface ProcessChunkParams {
  chunk: AudioChunk;
  env: Env;
  groqClient: Groq;
  roomService: RoomServiceClient;
  context: TrackContext;
}

async function processChunk({ chunk, env, groqClient, roomService, context }: ProcessChunkParams) {
  try {
    if (!hasSpeech(chunk, context, env)) {
      await broadcastStatus({
        roomService,
        roomName: env.STT_ROOM_NAME,
        message: `Silent chunk skipped (${chunk.metadata.chunkId})`,
        level: 'info',
      });
      return;
    }

    const transcription = await transcribeChunk({ chunk, env, groqClient, context, roomService });

    if (!transcription.segments.length) {
      return;
    }

    const batch: TranscriptBatch = {
      batchId: chunk.metadata.chunkId,
      segments: transcription.segments,
      isFinal: true,
      receivedAt: new Date().toISOString(),
    };

    transcriptHistory.push(...transcription.segments);
    while (transcriptHistory.length > 40) {
      transcriptHistory.shift();
    }

    await broadcastUpdate({
      batch,
      roomName: env.STT_ROOM_NAME,
      roomService,
    });

    await broadcastStatus({
      roomService,
      roomName: env.STT_ROOM_NAME,
      message: `Whisper processed chunk ${batch.batchId}`,
    });

    await requestCorrection({
      env,
      batch,
      context,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to process audio chunk');
    await broadcastStatus({
      roomService,
      roomName: env.STT_ROOM_NAME,
      message: `STT chunk failure: ${String(error)}`,
      level: 'error',
    });
  }
}


interface WhisperSegment {
  id?: string | number;
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
}

interface WhisperVerboseResponse {
  text?: string;
  segments?: WhisperSegment[];
}

interface TranscribeChunkParams {
  chunk: AudioChunk;
  env: Env;
  groqClient: Groq;
  context: TrackContext;
  roomService: RoomServiceClient;
}

function encodePcm16ToWav(samples: Int16Array, sampleRate: number, channels: number): Buffer {
  const pcmBuffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const headerSize = 44;
  const wavBuffer = Buffer.alloc(headerSize + pcmBuffer.length);

  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  const byteRate = sampleRate * channels * 2;
  wavBuffer.writeUInt32LE(byteRate, 28);
  const blockAlign = channels * 2;
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(16, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);

  pcmBuffer.copy(wavBuffer, headerSize);
  return wavBuffer;
}

/**
 * Extract only NEW text by comparing with what we've already broadcasted.
 * This prevents repetition at the source by only returning the suffix that's actually new.
 * 
 * Enhanced algorithm:
 * 1. Normalize both texts (lowercase, whitespace)
 * 2. Check if new text is entirely contained in previous (skip)
 * 3. Check if new text perfectly extends previous (return suffix)
 * 4. Find longest word-level overlap between end of prev and start of curr
 * 5. Use character-level fuzzy matching for robustness
 */
function extractNewText(alreadyBroadcasted: string, newTranscription: string): string {
  const prev = alreadyBroadcasted.trim().toLowerCase().replace(/\s+/g, ' ');
  const curr = newTranscription.trim().toLowerCase().replace(/\s+/g, ' ');
  
  if (!prev) return newTranscription.trim(); // First chunk, return as-is
  if (!curr) return ''; // Empty transcription
  
  // If new transcription is completely contained in what we already have, skip it
  if (prev.includes(curr)) {
    logger.debug('Skipping chunk - already broadcasted (exact match)');
    return '';
  }
  
  // If current text starts with all of previous, return only the new suffix
  if (curr.startsWith(prev)) {
    const newPart = newTranscription.trim().slice(prev.length).trim();
    logger.debug({ newPart, prevLength: prev.length }, 'Extracted new suffix after full prefix match');
    return newPart;
  }
  
  // Split into words for more robust matching
  const prevWords = prev.split(' ');
  const currWords = curr.split(' ');
  const originalCurrWords = newTranscription.trim().replace(/\s+/g, ' ').split(' ');
  
  let bestOverlap = 0;
  // Check up to 50 words or full length, whichever is smaller
  const maxCheck = Math.min(prevWords.length, currWords.length, 50);
  
  // Check from longest possible overlap down to 3 words (increased from 2 for better accuracy)
  for (let len = maxCheck; len >= 3; len -= 1) {
    const prevSuffix = prevWords.slice(-len).join(' ');
    const currPrefix = currWords.slice(0, len).join(' ');
    if (prevSuffix === currPrefix) {
      bestOverlap = len;
      break;
    }
  }
  
  // If we found a good overlap, return only the new words
  if (bestOverlap >= 3) {
    const newWords = originalCurrWords.slice(bestOverlap);
    const newPart = newWords.join(' ').trim();
    logger.debug({ 
      bestOverlap, 
      newPart,
      prevWordsCount: prevWords.length,
      currWordsCount: currWords.length,
      newWordsCount: newWords.length
    }, 'Extracted new text after word overlap');
    return newPart;
  }
  
  // Try character-level matching for smaller overlaps (handles minor variations)
  // Look for overlap at character level in the last 200 chars of prev and first 200 of curr
  const prevTail = prev.slice(-200);
  const currHead = curr.slice(0, 200);
  let charOverlap = 0;
  
  for (let len = Math.min(prevTail.length, currHead.length); len >= 20; len -= 1) {
    if (prevTail.slice(-len) === currHead.slice(0, len)) {
      charOverlap = len;
      break;
    }
  }
  
  if (charOverlap >= 20) {
    // Find word boundary after the character overlap
    const afterOverlap = newTranscription.trim().slice(charOverlap);
    const wordBoundary = afterOverlap.search(/\s/);
    const newPart = wordBoundary >= 0 ? afterOverlap.slice(wordBoundary).trim() : afterOverlap.trim();
    logger.debug({ 
      charOverlap,
      newPart: newPart.slice(0, 100)
    }, 'Extracted new text after character overlap');
    return newPart;
  }
  
  // Check if this is mostly redundant (>70% of words already in prev)
  const newWordsSet = new Set(currWords);
  const prevWordsSet = new Set(prevWords);
  let redundantCount = 0;
  for (const word of newWordsSet) {
    if (prevWordsSet.has(word)) {
      redundantCount += 1;
    }
  }
  const redundancyRatio = redundantCount / newWordsSet.size;
  
  if (redundancyRatio > 0.7 && currWords.length <= prevWords.length) {
    logger.debug({ redundancyRatio }, 'Skipping chunk - high redundancy with previous text');
    return '';
  }
  
  // No clear overlap found - this might be a completely new segment or a gap
  // Only log warning if it's suspiciously similar
  if (redundancyRatio > 0.5) {
    logger.warn({ 
      redundancyRatio,
      currPreview: curr.slice(0, 100)
    }, 'Potential repetition detected but no clear overlap - returning full text');
  }
  
  return newTranscription.trim();
}

/**
 * Enhanced dedup append function - similar to the Python example provided.
 * Finds overlapping word sequences and merges intelligently.
 */
function dedupAppend(buffer: string, newChunk: string): string {
  if (!buffer) return newChunk;
  if (!newChunk) return buffer;

  const bufferWords = buffer.trim().split(/\s+/);
  const chunkWords = newChunk.trim().split(/\s+/);
  
  // Check for overlaps from longest to shortest (minimum 2 words)
  const maxOverlap = Math.min(bufferWords.length, chunkWords.length, 20);
  
  for (let i = maxOverlap; i >= 2; i -= 1) {
    const bufferEnd = bufferWords.slice(-i).join(' ');
    const chunkStart = chunkWords.slice(0, i).join(' ');
    
    // Case-insensitive comparison
    if (bufferEnd.toLowerCase() === chunkStart.toLowerCase()) {
      const remainingChunk = chunkWords.slice(i).join(' ');
      return buffer + (remainingChunk ? ' ' + remainingChunk : '');
    }
  }
  
  // No overlap found, append with space
  return buffer + ' ' + newChunk;
}

/**
 * Split text into complete sentences based on sentence-ending punctuation.
 * Returns { completeSentences: string, remainder: string }
 */
function splitSentences(text: string): { completeSentences: string; remainder: string } {
  if (!text) return { completeSentences: '', remainder: '' };

  // Match sentences ending with . ! ? followed by space or end of string
  // This regex captures sentences including their punctuation
  const sentenceRegex = /[^.!?]+[.!?]+(?=\s|$)/g;
  const matches = text.match(sentenceRegex);
  
  if (!matches || matches.length === 0) {
    // No complete sentences found
    return { completeSentences: '', remainder: text.trim() };
  }

  const completeSentences = matches.join(' ').trim();
  const remainder = text.slice(completeSentences.length).trim();
  
  return { completeSentences, remainder };
}

/**
 * Post-processing cleanup to remove duplicate phrases and merge broken sentences.
 * Runs on complete sentences before broadcasting.
 */
function cleanupText(text: string, segments: WhisperSegment[]): string {
  if (!text) return '';
  
  // Normalize whitespace
  let cleaned = text.replace(/\s+/g, ' ').trim();
  
  const effectiveConfidence = computeConfidenceForText(segments, cleaned) ?? 1;

  if (effectiveConfidence >= 0.5) {
    const words = cleaned.split(' ');
    const result: string[] = [];
    let i = 0;

    while (i < words.length) {
      let foundRepeat = false;

      for (let phraseLen = Math.min(10, words.length - i); phraseLen >= 3; phraseLen -= 1) {
        if (i + phraseLen * 2 > words.length) continue;

        const phrase1 = words.slice(i, i + phraseLen).join(' ').toLowerCase();
        const phrase2 = words.slice(i + phraseLen, i + phraseLen * 2).join(' ').toLowerCase();

        if (phrase1 === phrase2) {
          result.push(...words.slice(i, i + phraseLen));
          i += phraseLen * 2;
          foundRepeat = true;
          break;
        }
      }

      if (!foundRepeat) {
        result.push(words[i]);
        i += 1;
      }
    }

    cleaned = result.join(' ');
  }
  
  // Fix multiple punctuation marks
  cleaned = cleaned.replace(/([.!?])\1+/g, '$1');
  
  // Fix spacing around punctuation
  cleaned = cleaned.replace(/\s+([.!?,;:])/g, '$1');
  
  // Ensure space after sentence-ending punctuation
  cleaned = cleaned.replace(/([.!?])([A-Z])/g, '$1 $2');
  
  return cleaned.trim();
}

function computeConfidenceForText(segments: WhisperSegment[], text: string): number | undefined {
  if (!segments.length) {
    return undefined;
  }

  const target = text.trim();
  if (!target) {
    return undefined;
  }

  let remaining = target.length;
  let weighted = 0;
  let total = 0;

  for (let i = segments.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const segmentText = segments[i].text?.trim();
    if (!segmentText) {
      continue;
    }
    const len = Math.min(segmentText.length, remaining);
    const weight = Math.max(1, len);
    weighted += (segments[i].confidence ?? 0.5) * weight;
    total += weight;
    remaining -= len;
  }

  if (total === 0) {
    return undefined;
  }

  return weighted / total;
}

function blendConfidence(current: number, incoming: number): number {
  const cur = Number.isFinite(current) ? current : 1;
  return Math.max(0, Math.min(1, cur * 0.5 + incoming * 0.5));
}

async function transcribeChunk({ chunk, env, groqClient, context, roomService }: TranscribeChunkParams) {
  totalChunksProcessed += 1;
  const startedAt = Date.now();
  
  const pcmSamples = new Int16Array(
    chunk.payload.buffer,
    chunk.payload.byteOffset,
    chunk.payload.byteLength / Int16Array.BYTES_PER_ELEMENT,
  );
  const wavBuffer = encodePcm16ToWav(pcmSamples, chunk.metadata.sampleRate, chunk.metadata.channels);
  const file = await toFile(wavBuffer, `${chunk.metadata.chunkId}.wav`, {
    type: 'audio/wav',
  });

  const language = normalizeLanguageCode(context.language ?? env.STT_LANGUAGE);
  const requestPayload: Parameters<typeof groqClient.audio.transcriptions.create>[0] = {
    file,
    model: env.GROQ_STT_MODEL,
    response_format: 'verbose_json',
    temperature: env.STT_TEMPERATURE,
    ...(language ? { language } : {}),
    ...(context.prompt ? { prompt: context.prompt } : {}),
  };

  const response = (await groqClient.audio.transcriptions.create(requestPayload)) as WhisperVerboseResponse;
  const latencyMs = Date.now() - startedAt;

  // Get the full text from Whisper
  const fullText = response.text?.trim() ?? '';
  
  if (!fullText) {
    return { segments: [] };
  }

  // CRITICAL FIX: Compare against BOTH broadcasted text AND buffered text
  // This prevents duplication when sentences are split across chunks
  const combinedContext = (lastBroadcastedText + ' ' + sentenceBuffer).trim();
  
  // Extract only the NEW part by comparing with what we've already seen (broadcasted + buffered)
  const newText = extractNewText(combinedContext, fullText);
  
  if (!newText) {
    totalChunksSkipped += 1;
    logger.debug({ 
      chunkId: chunk.metadata.chunkId,
      totalChunksProcessed,
      totalChunksSkipped,
      deduplicationRate: (totalChunksSkipped / totalChunksProcessed * 100).toFixed(1) + '%',
      combinedContextLength: combinedContext.length
    }, 'No new text after deduplication');
    return { segments: [] };
  }

  // Apply enhanced dedup append logic (like the Python example)
  const dedupedText = dedupAppend(combinedContext, newText);
  const actualNewText = dedupedText.slice(combinedContext.length).trim();
  
  if (!actualNewText) {
    totalChunksSkipped += 1;
    logger.debug({ chunkId: chunk.metadata.chunkId }, 'No new text after dedupAppend');
    return { segments: [] };
  }

  // Add to sentence buffer instead of broadcasting immediately
  sentenceBuffer = (sentenceBuffer + ' ' + actualNewText).trim();
  const confidenceForNewText = computeConfidenceForText(response.segments ?? [], actualNewText) ?? 1;
  sentenceConfidence = blendConfidence(sentenceConfidence, confidenceForNewText);
  
  // Split into complete sentences and remainder
  const { completeSentences, remainder } = splitSentences(sentenceBuffer);
  
  // If no complete sentences yet, wait for more text
  if (!completeSentences || sentenceConfidence < env.STT_CONFIDENCE_THRESHOLD) {
    logger.debug({ 
      chunkId: chunk.metadata.chunkId,
      bufferLength: sentenceBuffer.length,
      buffer: sentenceBuffer.slice(0, 100)
    }, 'Buffering incomplete sentence');
    return { segments: [] };
  }
  
  // Update buffer to keep only the remainder
  sentenceBuffer = remainder;
  sentenceConfidence = blendConfidence(1, confidenceForNewText);
  
  // Apply post-processing cleanup to complete sentences
  const cleanedText = cleanupText(completeSentences, response.segments ?? []);
  
  if (!cleanedText) {
    logger.debug({ chunkId: chunk.metadata.chunkId }, 'No text after cleanup');
    return { segments: [] };
  }

  // Update our record of what we've broadcasted
  lastBroadcastedText = (lastBroadcastedText + ' ' + cleanedText).trim();
  
  // Keep only last 1000 chars to prevent memory growth while maintaining better context
  if (lastBroadcastedText.length > 1000) {
    lastBroadcastedText = lastBroadcastedText.slice(-1000);
  }

  const bestConfidence = response.segments?.reduce((max, seg) => Math.max(max, seg.confidence ?? 0), 0) ?? 0;
  logger.info({ 
    chunkId: chunk.metadata.chunkId, 
    cleanedText,
    originalLength: fullText.length,
    newTextLength: actualNewText.length,
    cleanedLength: cleanedText.length,
    bufferRemainder: remainder.slice(0, 50),
    latencyMs,
    confidence: bestConfidence,
  }, 'Broadcasting complete sentences');

  // Create a single segment with the cleaned, complete sentences
  const segment: TranscriptSegment = {
    id: `${chunk.metadata.chunkId}-new`,
    text: cleanedText,
    startMs: chunk.metadata.startMs,
    endMs: chunk.metadata.endMs,
    isFinal: true,
    revision: 0,
    source: 'stt' as const,
    createdAt: new Date().toISOString(),
    confidence: bestConfidence,
  };

  const werProxy = computeWerProxy(fullText, cleanedText);

  await broadcastMetrics({
    event: {
      chunkId: chunk.metadata.chunkId,
      latencyMs,
      confidence: bestConfidence,
      werProxy,
      timestamp: new Date().toISOString(),
    },
    roomName: env.STT_ROOM_NAME,
    roomService,
  });

  return { segments: [segment] };
}

interface BroadcastUpdateParams {
  batch: TranscriptBatch;
  roomName: string;
  roomService: RoomServiceClient;
}

async function broadcastStatus({ roomService, roomName, message, level }: { roomService: RoomServiceClient; roomName: string; message: string; level?: 'info' | 'warn' | 'error'; }) {
  const payload = Buffer.from(
    JSON.stringify({
      type: 'status',
      payload: {
        level: level ?? 'info',
        message,
        timestamp: new Date().toISOString(),
      },
    }),
  );

  await roomService.sendData(roomName, payload, DataPacket_Kind.LOSSY, {
    topic: TRANSCRIPT_CHANNEL_LABEL,
  });
}

async function broadcastUpdate({ batch, roomName, roomService }: BroadcastUpdateParams) {
  const event: TranscriptUpdate = {
    type: 'stt',
    batch,
  };

  const payload = Buffer.from(
    JSON.stringify({
      type: 'transcript',
      payload: event,
    }),
  );

  await roomService.sendData(
    roomName,
    payload,
    DataPacket_Kind.RELIABLE,
    {
      topic: TRANSCRIPT_CHANNEL_LABEL,
    },
  );
}

async function broadcastMetrics({
  event,
  roomName,
  roomService,
}: {
  event: TranscriptMetricsEvent;
  roomName: string;
  roomService: RoomServiceClient;
}) {
  const payload = Buffer.from(
    JSON.stringify({
      type: 'metrics',
      payload: event,
    }),
  );

  await roomService.sendData(roomName, payload, DataPacket_Kind.LOSSY, {
    topic: TRANSCRIPT_CHANNEL_LABEL,
  });
}

interface RequestCorrectionParams {
  env: Env;
  batch: TranscriptBatch;
  context: TrackContext;
}

async function requestCorrection({ env, batch, context }: RequestCorrectionParams) {
  // Skip LLM if there's no text
  const hasText = (batch.segments ?? []).some((s) => (s.text?.trim()?.length ?? 0) > 0);
  if (!hasText) {
    return;
  }

  const language = normalizeLanguageCode(context.language ?? env.STT_LANGUAGE);
  const payload: CorrectionRequestPayload = {
    requestId: batch.batchId,
    roomName: env.STT_ROOM_NAME,
    targetIdentities: env.LLM_TARGET_IDENTITIES,
    batch,
    context: transcriptHistory.slice(-10),
    language,
    domainHint: context.domainHint,
    terminology: context.terminology,
  };

  const response = await fetch(`${env.LLM_SERVICE_URL}/v1/corrections/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM service responded with ${response.status}: ${errorBody}`);
  }

  // Consume the stream without processing to allow the service to finish.
  await response.text();
}

function computeRms(samples: Int16Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    sumSquares += s * s;
  }
  return Math.sqrt(sumSquares / Math.max(1, samples.length));
}

function applyGainControl(samples: Int16Array, context: TrackContext, env: Env): Int16Array {
  const rms = computeRms(samples);
  context.rmsAverage = context.rmsAverage * (1 - env.STT_GAIN_SMOOTHING) + rms * env.STT_GAIN_SMOOTHING;
  const desiredGain = env.STT_GAIN_TARGET_RMS / Math.max(context.rmsAverage, 1);
  const clamped = Math.max(env.STT_GAIN_MIN, Math.min(env.STT_GAIN_MAX, desiredGain));
  context.gain = context.gain * (1 - env.STT_GAIN_SMOOTHING) + clamped * env.STT_GAIN_SMOOTHING;

  if (Math.abs(context.gain - 1) < 0.05) {
    return samples;
  }

  for (let i = 0; i < samples.length; i += 1) {
    const scaled = samples[i] * context.gain;
    samples[i] = Math.max(-0x8000, Math.min(0x7fff, Math.round(scaled)));
  }

  return samples;
}

function hasSpeech(chunk: AudioChunk, context: TrackContext, env: Env): boolean {
  const samples = new Int16Array(
    chunk.payload.buffer,
    chunk.payload.byteOffset,
    chunk.payload.byteLength / Int16Array.BYTES_PER_ELEMENT,
  );

  const rms = computeRms(samples);
  context.noiseFloor = context.noiseFloor * 0.95 + rms * 0.05;
  const dynamicThreshold = Math.max(env.STT_SILENCE_RMS_THRESHOLD, context.noiseFloor * 1.6);

  const zeroCrossings = countZeroCrossings(samples);
  const vadWindow = Math.max(1, Math.round((env.STT_VAD_WINDOW_MS / env.STT_WINDOW_MS) * 4));
  context.vadAccumulator.push(zeroCrossings / samples.length);
  if (context.vadAccumulator.length > vadWindow) {
    context.vadAccumulator.shift();
  }
  const avgZcr = context.vadAccumulator.reduce((sum, val) => sum + val, 0) /
    Math.max(1, context.vadAccumulator.length);

  const speechScore = (rms / Math.max(1, dynamicThreshold)) * 0.7 + avgZcr * 0.3;
  return speechScore >= env.STT_VAD_SENSITIVITY;
}

function countZeroCrossings(samples: Int16Array): number {
  let crossings = 0;
  let prev = samples[0] ?? 0;
  for (let i = 1; i < samples.length; i += 1) {
    const current = samples[i];
    if ((prev >= 0 && current < 0) || (prev < 0 && current >= 0)) {
      crossings += 1;
    }
    prev = current;
  }
  return crossings;
}

function safeParseMetadata(metadata?: string | null):
  | { locale?: string; domainHint?: string; terminology?: string[] }
  | undefined {
  if (!metadata) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(metadata);
    if (typeof parsed !== 'object' || !parsed) {
      return undefined;
    }

    const locale = typeof parsed.locale === 'string' ? parsed.locale : undefined;
    const domainHint = typeof parsed.domainHint === 'string' ? parsed.domainHint : undefined;
    const terminology = Array.isArray(parsed.terminology)
      ? parsed.terminology.filter((item: unknown) => typeof item === 'string')
      : undefined;

    return { locale, domainHint, terminology };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to parse participant metadata');
    return undefined;
  }
}

function computeWerProxy(original: string, corrected: string): number {
  const normalizedOriginal = original.trim().toLowerCase();
  const normalizedCorrected = corrected.trim().toLowerCase();

  if (!normalizedOriginal && !normalizedCorrected) {
    return 0;
  }

  const distance = levenshtein(normalizedOriginal, normalizedCorrected);
  const maxLen = Math.max(normalizedOriginal.length, normalizedCorrected.length, 1);
  return distance / maxLen;
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

interface BuildAccessTokenParams {
  apiKey: string;
  apiSecret: string;
  identity: string;
  roomName: string;
  canPublish: boolean;
  canSubscribe: boolean;
}

async function buildAccessToken(params: BuildAccessTokenParams) {
  const token = new AccessToken(params.apiKey, params.apiSecret, {
    identity: params.identity,
    ttl: 60 * 60,
  });

  token.addGrant({
    room: params.roomName,
    roomJoin: true,
    canPublish: params.canPublish,
    canSubscribe: params.canSubscribe,
    canPublishData: false,
  });

  return token.toJwt();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startSttWorker().catch((error) => {
    logger.error({ err: error }, 'STT worker failed to start');
    process.exitCode = 1;
  });
}

