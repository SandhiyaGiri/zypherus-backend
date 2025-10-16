import { randomUUID } from 'node:crypto';

import { AudioChunk, AudioChunkMetadata } from '@zypherus/shared-types';

export interface SlidingWindowConfig {
  sampleRate: number;
  channels: number;
  windowMs: number;
  strideMs: number;
  format?: 's16le' | 'f32le';
}

export interface SlidingWindowState {
  buffer: Int16Array;
  cursor: number;
}

export function createEmptyState(capacity: number): SlidingWindowState {
  return {
    buffer: new Int16Array(capacity),
    cursor: 0,
  };
}

export function appendSamples(
  state: SlidingWindowState,
  samples: Int16Array,
): SlidingWindowState {
  const remaining = state.buffer.length - state.cursor;
  if (samples.length > remaining) {
    throw new Error('Sliding window overflow');
  }

  state.buffer.set(samples, state.cursor);
  state.cursor += samples.length;
  return state;
}

export function hasWindow(state: SlidingWindowState): boolean {
  return state.cursor === state.buffer.length;
}

export function shiftWindow(
  state: SlidingWindowState,
  strideSamples: number,
): SlidingWindowState {
  const remaining = state.buffer.length - strideSamples;
  if (remaining <= 0) {
    state.cursor = 0;
    return state;
  }

  state.buffer.copyWithin(0, strideSamples, state.buffer.length);
  state.cursor = remaining;
  return state;
}

export function cloneSamples(buffer: Int16Array): Int16Array {
  return buffer.slice();
}

export function buildChunk(
  samples: Int16Array,
  metadata: Omit<AudioChunkMetadata, 'format'> & { format?: 's16le' | 'f32le' },
): AudioChunk {
  return {
    metadata: {
      ...metadata,
      format: metadata.format ?? 's16le',
    },
    payload: new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
  };
}

export function calculateSamples(
  sampleRate: number,
  durationMs: number,
  channels = 1,
): number {
  return Math.floor((sampleRate * durationMs * channels) / 1000);
}

export function pcm16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);
  const scale = 1 / 0x7fff;
  for (let i = 0; i < input.length; i += 1) {
    output[i] = input[i] * scale;
  }
  return output;
}

export function float32ToPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

export function computeTimestamps(
  startMs: number,
  sampleRate: number,
  sampleCount: number,
): { startMs: number; endMs: number } {
  const durationMs = Math.round((sampleCount / sampleRate) * 1000);
  return {
    startMs,
    endMs: startMs + durationMs,
  };
}

/**
 * Convert interleaved stereo audio to mono by averaging left and right channels.
 */
export function stereoToMono(stereoSamples: Int16Array): Int16Array {
  const monoLength = Math.floor(stereoSamples.length / 2);
  const mono = new Int16Array(monoLength);
  for (let i = 0; i < monoLength; i += 1) {
    const left = stereoSamples[i * 2];
    const right = stereoSamples[i * 2 + 1];
    mono[i] = Math.round((left + right) / 2);
  }
  return mono;
}

/**
 * Resample audio by decimation (simple downsampling by taking every Nth sample).
 * For better quality, consider using a proper resampling library.
 */
export function resampleLinear(
  input: Int16Array,
  fromRate: number,
  toRate: number,
): Int16Array {
  if (fromRate === toRate) {
    return input;
  }

  if (fromRate <= 0 || toRate <= 0) {
    throw new Error('Sample rates must be positive');
  }

  const lengthRatio = toRate / fromRate;
  const outLength = Math.max(1, Math.round(input.length * lengthRatio));
  const smoothed = new Float32Array(input.length);
  let prev = input[0] ?? 0;
  const alpha = Math.min(1, lengthRatio * 1.5);

  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i];
    prev += alpha * (sample - prev);
    smoothed[i] = prev;
  }

  const output = new Int16Array(outLength);
  const scale = (input.length - 1) / Math.max(1, outLength - 1);

  for (let i = 0; i < outLength; i += 1) {
    const position = i * scale;
    const index = Math.floor(position);
    const frac = position - index;
    const nextIndex = Math.min(index + 1, smoothed.length - 1);
    const value = smoothed[index] * (1 - frac) + smoothed[nextIndex] * frac;
    output[i] = Math.max(-0x8000, Math.min(0x7fff, Math.round(value)));
  }

  return output;
}

export function resampleByDecimation(
  input: Int16Array,
  fromRate: number,
  toRate: number,
): Int16Array {
  return resampleLinear(input, fromRate, toRate);
}

/**
 * Convert audio from arbitrary format to target format.
 * Handles channel conversion (stereo->mono) and sample rate conversion.
 */
export function convertAudioFormat(
  input: Int16Array,
  fromChannels: number,
  fromRate: number,
  toChannels: number,
  toRate: number,
): Int16Array {
  let processed = input;
  
  // Convert channels first (stereo to mono)
  if (fromChannels === 2 && toChannels === 1) {
    processed = stereoToMono(processed);
  } else if (fromChannels !== toChannels) {
    throw new Error(`Unsupported channel conversion: ${fromChannels} -> ${toChannels}`);
  }
  
  // Then resample
  if (fromRate !== toRate) {
    processed = resampleLinear(processed, fromRate, toRate);
  }
  
  return processed;
}

export interface ChunkedSamples {
  chunk: AudioChunk;
  nextState: SlidingWindowState;
}

export function processSamples(
  state: SlidingWindowState,
  samples: Int16Array,
  config: SlidingWindowConfig,
  chunkFactory: (payload: Int16Array, meta: AudioChunkMetadata) => AudioChunk,
  timestampMs: number,
): ChunkedSamples[] {
  const outputs: ChunkedSamples[] = [];

  const windowSamples = calculateSamples(config.sampleRate, config.windowMs, config.channels);
  const strideSamples = calculateSamples(config.sampleRate, config.strideMs, config.channels);

  if (state.buffer.length !== windowSamples) {
    throw new Error('Sliding window state capacity mismatch');
  }

  let offset = 0;
  let currentTimestamp = timestampMs;

  while (offset < samples.length) {
    const available = state.buffer.length - state.cursor;

    if (available === 0) {
      // Buffer is full, flush a window before accepting more samples.
      const payload = cloneSamples(state.buffer);
      const meta: AudioChunkMetadata = {
        chunkId: randomUUID(),
        startMs: currentTimestamp,
        endMs: currentTimestamp + config.windowMs,
        sampleRate: config.sampleRate,
        channels: config.channels,
        format: config.format ?? 's16le',
        captureStartedAt: new Date(currentTimestamp).toISOString(),
        captureCompletedAt: new Date(currentTimestamp + config.windowMs).toISOString(),
      };

      outputs.push({
        chunk: chunkFactory(payload, meta),
        nextState: state,
      });

      shiftWindow(state, strideSamples);
      currentTimestamp += config.strideMs;
      continue;
    }

    const remaining = samples.length - offset;
    const take = Math.min(available, remaining);
    const slice = samples.subarray(offset, offset + take);
    appendSamples(state, slice);
    offset += take;

    while (hasWindow(state)) {
      const payload = cloneSamples(state.buffer);
      const meta: AudioChunkMetadata = {
        chunkId: randomUUID(),
        startMs: currentTimestamp,
        endMs: currentTimestamp + config.windowMs,
        sampleRate: config.sampleRate,
        channels: config.channels,
        format: config.format ?? 's16le',
        captureStartedAt: new Date(currentTimestamp).toISOString(),
        captureCompletedAt: new Date(currentTimestamp + config.windowMs).toISOString(),
      };

      outputs.push({
        chunk: chunkFactory(payload, meta),
        nextState: state,
      });

      shiftWindow(state, strideSamples);
      currentTimestamp += config.strideMs;
    }
  }

  return outputs;
}
