export type TranscriptSource = 'stt' | 'llm';

export interface TranscriptSegment {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  isFinal: boolean;
  revision: number;
  source: TranscriptSource;
  correctedFromId?: string;
  createdAt: string;
}

export interface TranscriptBatch {
  batchId: string;
  segments: TranscriptSegment[];
  isFinal: boolean;
  receivedAt: string;
}

export interface TranscriptDiff {
  originalSegmentIds: string[];
  replacement: TranscriptSegment;
}

export interface TranscriptUpdate {
  type: 'stt' | 'llm';
  batch: TranscriptBatch;
  diffs?: TranscriptDiff[];
}

export interface AudioChunkMetadata {
  chunkId: string;
  startMs: number;
  endMs: number;
  sampleRate: number;
  channels: number;
  format: 's16le' | 'f32le';
  captureStartedAt: string;
  captureCompletedAt: string;
}

export interface AudioChunk {
  metadata: AudioChunkMetadata;
  payload: Uint8Array;
}

export interface SttWorkerConfig {
  livekitUrl: string;
  roomName: string;
  participantIdentity: string;
  participantToken: string;
  groqApiKey: string;
  groqModel: string;
  windowMs: number;
  strideMs: number;
  languageCode?: string;
}

export interface CorrectionRequestPayload {
  requestId: string;
  roomName: string;
  targetIdentities?: string[];
  batch: TranscriptBatch;
  context: TranscriptSegment[];
  language?: string;
  domainHint?: string;
  terminology?: string[];
}

export interface CorrectionStreamDelta {
  requestId: string;
  roomName: string;
  text: string;
  isFinal: boolean;
  cursorStart?: number;
  cursorEnd?: number;
}

export type StreamEvent =
  | { type: 'status'; payload: StatusEvent }
  | { type: 'transcript'; payload: TranscriptUpdate }
  | { type: 'correction'; payload: CorrectionStreamDelta }
  | { type: 'metrics'; payload: TranscriptMetricsEvent };

export interface StatusEvent {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface TranscriptMetricsEvent {
  chunkId: string;
  latencyMs: number;
  werProxy: number;
  confidence: number;
  timestamp: string;
}

export interface LlmServiceConfig {
  port: number;
  provider: 'groq-kimi-k2';
  apiKey: string;
  model: string;
  temperature: number;
}

export interface LiveKitJoinPayload {
  url: string;
  token: string;
  roomName: string;
  identity: string;
}

export const DEFAULT_GROQ_MODEL = 'whisper-large-v3-turbo';
export const DEFAULT_LLM_MODEL = 'kimi-k2';
export const TRANSCRIPT_CHANNEL_LABEL = 'transcript-events';
