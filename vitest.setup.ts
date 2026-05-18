import { vi } from 'vitest';

process.env.VALKEY_URL = 'redis://localhost:6379/0';
process.env.MULTIREAD_ENABLED = 'true';
process.env.PASSWORD_PROTECTION_ENABLED = 'true';
// getClientIp() now throws when TRUSTED_PROXY_HOPS is unset (security fix
// against rate-limit collapse). Provide a sane default for the whole suite;
// http.test.ts overrides per-test to cover the unset/invalid branches.
process.env.TRUSTED_PROXY_HOPS = '1';

vi.mock('ioredis', async () => {
    const mod = await import('ioredis-mock');
    const IoRedisMock = mod.default;
    return {
        default: IoRedisMock,
        Redis: IoRedisMock,
    };
});
