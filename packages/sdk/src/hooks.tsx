import { useEffect, useMemo, useState } from 'react';
import { ConnectionState } from 'livekit-client';
import type { ZypherusClient } from './client.js';
import type { StatusEntry, UseZypherusOptions, UseZypherusValue, ZypherusTextState } from './types.js';

export function useZypherusStream(client: ZypherusClient, options?: UseZypherusOptions): UseZypherusValue {
  const [state, setState] = useState<ZypherusTextState>(() => client.getState());
  const [connection, setConnection] = useState<ConnectionState>(() => client.getConnectionState());
  const [statuses, setStatuses] = useState<StatusEntry[]>([]);
  const statusLimit = options?.statusLimit ?? 20;

  useEffect(() => {
    setState(client.getState());
    setConnection(client.getConnectionState());

    const disposeState = client.on('state', setState);
    const disposeConnection = client.on('connection', setConnection);
    const disposeStatus = client.on('status', (status) => {
      setStatuses((current) => {
        const next: StatusEntry[] = [
          {
            ...status,
            id: generateId(),
          },
          ...current,
        ];
        return next.slice(0, statusLimit);
      });
    });

    return () => {
      disposeState();
      disposeConnection();
      disposeStatus();
    };
  }, [client, statusLimit]);

  return useMemo<UseZypherusValue>(() => ({
    state,
    connection,
    statuses,
  }), [state, connection, statuses]);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
