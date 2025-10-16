import type { TranscriptSegment } from '@zypherus/shared-types';
import clsx from 'clsx';

export interface TranscriptStreamProps {
  segments: TranscriptSegment[];
  highlightLatest?: boolean;
}

export function TranscriptStream({ segments, highlightLatest }: TranscriptStreamProps) {
  if (!segments.length) {
    return <p className="ui-transcript-placeholder">No transcript yet.</p>;
  }

  return (
    <div className="ui-transcript-stream">
      {segments.map((segment, index) => {
        const isLatest = highlightLatest && index === segments.length - 1;
        return (
          <p
            key={segment.id}
            className={clsx('ui-transcript-line', {
              'ui-transcript-line--latest': isLatest,
              'ui-transcript-line--llm': segment.source === 'llm',
            })}
          >
            <span className="ui-transcript-time">
              {formatTimestamp(segment.startMs)}–{formatTimestamp(segment.endMs)}
            </span>
            <span className="ui-transcript-text">{segment.text}</span>
          </p>
        );
      })}
    </div>
  );
}

function formatTimestamp(ms: number) {
  return (ms / 1000).toFixed(2) + 's';
}
