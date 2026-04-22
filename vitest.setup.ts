import { vi } from 'vitest';

process.env.VALKEY_URL = 'redis://localhost:6379/0';

vi.mock('ioredis', async () => {
    const mod = await import('ioredis-mock');
    const IoRedisMock = mod.default;
    return {
        default: IoRedisMock,
        Redis: IoRedisMock,
    };
});
