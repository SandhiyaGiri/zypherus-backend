import type { LiveKitJoinPayload } from '@zypherus/shared-types';
import type { DevServerTokenProviderOptions, TokenProvider, TokenProviderContext } from './types.js';

export function createDevServerTokenProvider(options: DevServerTokenProviderOptions): TokenProvider {
  const { baseUrl, roomName, identity, autoCreate, metadata, fetchImpl } = options;
  const endpoint = `${trimTrailingSlash(baseUrl)}/livekit/token`;
  const fetchFn = fetchImpl ?? globalThis.fetch;

  if (!fetchFn) {
    throw new Error('Global fetch API is unavailable. Provide fetchImpl in createDevServerTokenProvider.');
  }

  return async (context?: TokenProviderContext) => {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomName,
        identity,
        autoCreate,
        metadata,
      }),
      signal: context?.abortSignal,
    });

    if (!response.ok) {
      const details = await safeReadText(response);
      throw new Error(`Failed to retrieve LiveKit token (${response.status}): ${details}`);
    }

    return (await response.json()) as LiveKitJoinPayload;
  };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
