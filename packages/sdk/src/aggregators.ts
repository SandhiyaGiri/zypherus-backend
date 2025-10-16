import type { CorrectionStreamDelta, TranscriptBatch, TranscriptSegment } from '@zypherus/shared-types';

export interface TranscriptAggregationResult {
  rawFinalizedText: string;
  rawPendingText: string;
}

export class TranscriptAccumulator {
  private readonly finalSegments = new Map<string, TranscriptSegment>();
  private readonly pendingSegments = new Map<string, TranscriptSegment>();

  ingest(batch: TranscriptBatch): TranscriptAggregationResult | null {
    let mutated = false;

    for (const segment of batch.segments ?? []) {
      const trimmed = segment.text?.trim() ?? '';

      if (segment.isFinal) {
        if (this.pendingSegments.delete(segment.id)) {
          mutated = true;
        }

        if (!trimmed) {
          if (this.finalSegments.delete(segment.id)) {
            mutated = true;
          }
          continue;
        }

        const existing = this.finalSegments.get(segment.id);
        if (!existing || existing.revision <= segment.revision || existing.text !== segment.text) {
          this.finalSegments.set(segment.id, segment);
          mutated = true;
        }
        continue;
      }

      if (!trimmed) {
        if (this.pendingSegments.delete(segment.id)) {
          mutated = true;
        }
        continue;
      }

      const previous = this.pendingSegments.get(segment.id);
      if (!previous || previous.revision <= segment.revision || previous.text !== segment.text) {
        this.pendingSegments.set(segment.id, segment);
        mutated = true;
      }
    }

    if (!mutated) {
      return null;
    }

    return {
      rawFinalizedText: this.buildSentence(this.finalSegments),
      rawPendingText: this.buildSentence(this.pendingSegments),
    };
  }

  reset(): void {
    this.finalSegments.clear();
    this.pendingSegments.clear();
  }

  private buildSentence(segments: Map<string, TranscriptSegment>): string {
    return Array.from(segments.values())
      .sort((a, b) => {
        if (a.startMs !== b.startMs) {
          return a.startMs - b.startMs;
        }
        if (a.endMs !== b.endMs) {
          return a.endMs - b.endMs;
        }
        if (a.revision !== b.revision) {
          return a.revision - b.revision;
        }
        return a.id.localeCompare(b.id);
      })
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }
}

export interface CorrectionAggregationResult {
  correctedText: string;
  correctedIsFinal: boolean;
}

export class CorrectionAccumulator {
  private finalText = '';
  private pendingText = '';

  ingest(delta: CorrectionStreamDelta): CorrectionAggregationResult | null {
    const trimmed = delta.text?.trim() ?? '';

    if (delta.isFinal) {
      if (this.finalText === trimmed && !this.pendingText) {
        return null;
      }
      this.finalText = trimmed;
      this.pendingText = '';
      return {
        correctedText: this.finalText,
        correctedIsFinal: true,
      };
    }

    if (this.pendingText === trimmed) {
      return null;
    }

    this.pendingText = trimmed;
    return {
      correctedText: this.pendingText || this.finalText,
      correctedIsFinal: false,
    };
  }

  reset(): void {
    this.finalText = '';
    this.pendingText = '';
  }
}
