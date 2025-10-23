import type {
  LiveKitJoinPayload,
  TranscriptBatch,
  CorrectionStreamDelta,
  TranscriptMetricsEvent,
  StatusEvent,
} from '@zypherus/shared-types';
import type {
  AudioCaptureOptions,
  ConnectionState,
  RoomConnectOptions,
  RoomOptions,
  TrackPublishOptions,
} from 'livekit-client';

export interface TokenProviderContext {
  abortSignal?: AbortSignal;
}

export type TokenProvider = (context?: TokenProviderContext) => Promise<LiveKitJoinPayload>;

export interface ZypherusClientOptions {
  tokenProvider: TokenProvider;
  roomOptions?: RoomOptions;
  connectOptions?: RoomConnectOptions;
  dataTopic?: string;
}

export interface StartRecordingOptions {
  audioCapture?: AudioCaptureOptions;
  publishOptions?: TrackPublishOptions;
}

export interface ZypherusTextState {
  rawFinalizedText: string;
  rawPendingText: string;
  correctedText: string;
  correctedIsFinal: boolean;
  recording: boolean;
}

export interface ZypherusEventMap {
  connection: ConnectionState;
  status: StatusEvent;
  transcript: TranscriptBatch;
  correction: CorrectionStreamDelta;
  metrics: TranscriptMetricsEvent;
  state: ZypherusTextState;
  recording: boolean;
  error: Error;
}

export interface StatusEntry extends StatusEvent {
  id: string;
}

export type EventListener<T> = (payload: T) => void;

export interface DevServerTokenProviderOptions {
  baseUrl: string;
  roomName: string;
  identity?: string;
  autoCreate?: boolean;
  metadata?: Record<string, unknown>;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface UseZypherusOptions {
  statusLimit?: number;
}

export interface UseZypherusValue {
  state: ZypherusTextState;
  connection: ConnectionState;
  statuses: StatusEntry[];
}
