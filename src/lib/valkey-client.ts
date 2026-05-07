import { Redis, type RedisOptions } from 'ioredis';

export const SECRET_KEY_PREFIX = 'secret:';
export const RATE_LIMIT_KEY_PREFIX = 'rl:';

function readValkeyUrl(): string {
    const url = process.env.VALKEY_URL;
    if (!url) {
        throw new Error('VALKEY_URL is not set; Burnotes requires a Valkey connection');
    }
    return url;
}

function createValkey(): Redis {
    const options: RedisOptions = {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        enableOfflineQueue: true,
    };
    const client = new Redis(readValkeyUrl(), options);

    client.on('error', (err: Error) => {
        console.error('[valkey] connection error:', err.message);
    });
    client.on('connect', () => {
        console.log('[valkey] socket connected');
    });
    client.on('ready', () => {
        console.log('[valkey] ready');
    });
    client.on('reconnecting', (delayMs: number) => {
        console.warn(`[valkey] reconnecting in ${delayMs}ms`);
    });
    client.on('end', () => {
        console.warn('[valkey] connection ended');
    });
    client.on('close', () => {
        console.warn('[valkey] connection closed');
    });
    return client;
}

declare global {
    // eslint-disable-next-line no-var
    var __valkeyClient: Redis | undefined;
}

export function getValkey(): Redis {
    const client = globalThis.__valkeyClient ?? createValkey();
    globalThis.__valkeyClient = client;
    return client;
}
