import {
  TRANSCRIPT_CHANNEL_LABEL,
  type LiveKitJoinPayload,
  type TranscriptUpdate,
  type CorrectionStreamDelta,
  type TranscriptBatch,
  type StatusEvent,
  type TranscriptMetricsEvent,
} from '@zypherus/shared-types';
import {
  ConnectionState,
  DataPacket_Kind,
  Room,
  RoomEvent,
  type RemoteParticipant,
  createLocalAudioTrack,
  type LocalAudioTrack,
} from 'livekit-client';
import { TypedEventEmitter } from './emitter.js';
import {
  type StartRecordingOptions,
  type TokenProvider,
  type ZypherusClientOptions,
  type ZypherusEventMap,
  type ZypherusTextState,
} from './types.js';
import {
  CorrectionAccumulator,
  TranscriptAccumulator,
  type CorrectionAggregationResult,
  type TranscriptAggregationResult,
} from './aggregators.js';

type DataListenerArgs = [payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind, topic?: string];

const DECODER = new TextDecoder();

export class ZypherusClient {
  private readonly tokenProvider: TokenProvider;
  private readonly dataTopic: string;
  private readonly roomOptions: ZypherusClientOptions['roomOptions'];
  private readonly connectOptions: ZypherusClientOptions['connectOptions'];
  private readonly emitter = new TypedEventEmitter<ZypherusEventMap>();
  private readonly transcripts = new TranscriptAccumulator();
  private readonly corrections = new CorrectionAccumulator();

  private room: Room | undefined;
  private micTrack: LocalAudioTrack | undefined;
  private connectionState: ConnectionState = ConnectionState.Disconnected;
  private joinPayload: LiveKitJoinPayload | undefined;

  private state: ZypherusTextState = {
    rawFinalizedText: '',
    rawPendingText: '',
    correctedText: '',
    correctedIsFinal: false,
    recording: false,
  };

  private readonly boundConnectionChanged = (state: ConnectionState) => {
    this.updateConnectionState(state);
  };

  private readonly boundDataReceived = (...args: DataListenerArgs) => {
    this.handleData(...args);
  };

  private readonly boundDisconnected = () => {
    this.updateConnectionState(ConnectionState.Disconnected);
    void this.stopRecording().catch(() => undefined);
  };

  constructor(private readonly options: ZypherusClientOptions) {
    this.tokenProvider = options.tokenProvider;
    this.dataTopic = options.dataTopic ?? TRANSCRIPT_CHANNEL_LABEL;
    this.roomOptions = options.roomOptions;
    this.connectOptions = options.connectOptions;
  }

  getState(): ZypherusTextState {
    return this.state;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isRecording(): boolean {
    return this.state.recording;
  }

  on<K extends keyof ZypherusEventMap>(event: K, listener: (payload: ZypherusEventMap[K]) => void): () => void {
    return this.emitter.on(event, listener);
  }

  off<K extends keyof ZypherusEventMap>(event: K, listener: (payload: ZypherusEventMap[K]) => void): void {
    this.emitter.off(event, listener);
  }

  once<K extends keyof ZypherusEventMap>(event: K, listener: (payload: ZypherusEventMap[K]) => void): () => void {
    return this.emitter.once(event, listener);
  }

  async connect(): Promise<void> {
    if (this.room && this.connectionState !== ConnectionState.Disconnected) {
      return;
    }

    const payload = await this.tokenProvider();
    this.joinPayload = payload;

    const room = new Room(this.roomOptions);
    this.room = room;

    room
      .on(RoomEvent.ConnectionStateChanged, this.boundConnectionChanged)
      .on(RoomEvent.DataReceived, this.boundDataReceived)
      .on(RoomEvent.Disconnected, this.boundDisconnected);

    try {
      await room.connect(payload.url, payload.token, this.connectOptions);
      this.updateConnectionState(room.state);
    } catch (error) {
      this.cleanupRoom(room);
      this.room = undefined;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.stopRecording().catch(() => undefined);

    if (!this.room) {
      return;
    }

    const room = this.room;
    this.cleanupRoom(room);
    this.room = undefined;
    this.transcripts.reset();
    this.corrections.reset();
    this.joinPayload = undefined;
    await room.disconnect();
    this.updateState({
      rawFinalizedText: '',
      rawPendingText: '',
      correctedText: '',
      correctedIsFinal: false,
    });
    this.updateConnectionState(ConnectionState.Disconnected);
  }

  async startRecording(options?: StartRecordingOptions): Promise<void> {
    if (!this.room || this.connectionState !== ConnectionState.Connected) {
      await this.connect();
    }

    if (!this.room) {
      throw new Error('Unable to start recording, room is unavailable');
    }

    if (this.micTrack) {
      return;
    }

    const track = await createLocalAudioTrack(options?.audioCapture);
    await this.room.localParticipant.publishTrack(track, options?.publishOptions);
    this.micTrack = track;
    this.updateRecording(true);
  }

  async stopRecording(): Promise<void> {
    if (!this.micTrack || !this.room) {
      this.updateRecording(false);
      return;
    }

    const track = this.micTrack;
    this.micTrack = undefined;

    try {
      this.room.localParticipant.unpublishTrack(track, true);
    } finally {
      track.stop();
      this.updateRecording(false);
    }
  }

  getJoinPayload(): LiveKitJoinPayload | undefined {
    return this.joinPayload;
  }

  private updateState(patch: Partial<Omit<ZypherusTextState, 'recording'>>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.emitter.emit('state', this.state);
  }

  private updateRecording(recording: boolean): void {
    if (this.state.recording === recording) {
      return;
    }
    this.state = {
      ...this.state,
      recording,
    };
    this.emitter.emit('recording', recording);
    this.emitter.emit('state', this.state);
  }

  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.emitter.emit('connection', state);
  }

  private cleanupRoom(room: Room): void {
    room
      .off(RoomEvent.ConnectionStateChanged, this.boundConnectionChanged)
      .off(RoomEvent.DataReceived, this.boundDataReceived)
      .off(RoomEvent.Disconnected, this.boundDisconnected);
  }

  private handleData(payload: Uint8Array, _participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string): void {
    if (topic && topic !== this.dataTopic) {
      return;
    }

    try {
      const decoded = DECODER.decode(payload);
      const envelope = JSON.parse(decoded) as { type: string; payload: unknown };

      switch (envelope.type) {
        case 'transcript':
          this.handleTranscript(envelope.payload as TranscriptUpdate);
          break;
        case 'correction':
          this.handleCorrection(envelope.payload as CorrectionStreamDelta);
          break;
        case 'status':
          this.handleStatus(envelope.payload as StatusEvent);
          break;
        case 'metrics':
          this.handleMetrics(envelope.payload as TranscriptMetricsEvent);
          break;
        default:
          break;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitter.emit('error', err);
    }
  }

  private handleTranscript(update: TranscriptUpdate | undefined): void {
    if (!update || !update.batch) {
      return;
    }

    this.emitter.emit('transcript', update.batch as TranscriptBatch);
    const aggregation = this.transcripts.ingest(update.batch);
    if (aggregation) {
      this.applyTranscriptAggregation(aggregation);
    }
  }

  private handleCorrection(delta: CorrectionStreamDelta | undefined): void {
    if (!delta) {
      return;
    }

    this.emitter.emit('correction', delta);
    const aggregation = this.corrections.ingest(delta);
    if (aggregation) {
      this.applyCorrectionAggregation(aggregation);
    }
  }

  private handleStatus(status: StatusEvent | undefined): void {
    if (!status) {
      return;
    }
    this.emitter.emit('status', status);
  }

  private handleMetrics(metrics: TranscriptMetricsEvent | undefined): void {
    if (!metrics) {
      return;
    }
    this.emitter.emit('metrics', metrics);
  }

  private applyTranscriptAggregation(result: TranscriptAggregationResult): void {
    this.updateState({
      rawFinalizedText: result.rawFinalizedText,
      rawPendingText: result.rawPendingText,
    });
  }

  private applyCorrectionAggregation(result: CorrectionAggregationResult): void {
    this.updateState({
      correctedText: result.correctedText,
      correctedIsFinal: result.correctedIsFinal,
    });
  }
}
