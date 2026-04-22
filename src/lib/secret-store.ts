import type { Redis } from 'ioredis';
import type { EncryptedSecret } from '@/lib/secret-crypto';
import { getValkey, SECRET_KEY_PREFIX } from '@/lib/valkey-client';

const SECRET_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
    return 0
end
redis.call('HSET', KEYS[1],
    'encryptedSecret', ARGV[1],
    'accessTokenHash', ARGV[2],
    'expiresAt', ARGV[3],
    'failedAttempts', '0')
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return 1
`;

// Constant-time compare inside the script: we always read the stored hash,
// always iterate the full length on match, and always HINCRBY on miss — so an
// attacker cannot distinguish "missing" from "wrong token" from "wrong length"
// through a timing oracle on the Valkey round trip.
const CONSUME_SCRIPT = `
local stored = redis.call('HGET', KEYS[1], 'accessTokenHash')
if not stored then
    return {'missing'}
end
local diff = 0
if #stored == #ARGV[1] then
    for i = 1, #stored do
        local a = string.byte(stored, i)
        local b = string.byte(ARGV[1], i)
        diff = diff + (a - b) * (a - b)
    end
else
    diff = 1
end
if diff > 0 then
    local failed = redis.call('HINCRBY', KEYS[1], 'failedAttempts', 1)
    if failed >= tonumber(ARGV[2]) then
        redis.call('DEL', KEYS[1])
    end
    return {'mismatch'}
end
local encrypted = redis.call('HGET', KEYS[1], 'encryptedSecret')
redis.call('DEL', KEYS[1])
return {'ok', encrypted}
`;

type BurnotesCommands = {
    burnotesCreate: (...args: (string | number)[]) => Promise<number>;
    burnotesConsume: (...args: (string | number)[]) => Promise<[string] | [string, string]>;
};

const registered = new WeakSet<Redis>();

function getClient(): Redis & BurnotesCommands {
    const client = getValkey();
    if (!registered.has(client)) {
        client.defineCommand('burnotesCreate', { numberOfKeys: 1, lua: CREATE_SCRIPT });
        client.defineCommand('burnotesConsume', { numberOfKeys: 1, lua: CONSUME_SCRIPT });
        registered.add(client);
    }
    return client as Redis & BurnotesCommands;
}

function secretKey(id: string): string {
    return `${SECRET_KEY_PREFIX}${id}`;
}

class SecretStore {
    async create(
        id: string,
        encryptedSecret: EncryptedSecret,
        accessTokenHash: string,
    ): Promise<{ expiresAt: number } | null> {
        const client = getClient();
        const expiresAt = Date.now() + SECRET_TTL_MS;
        const result = await client.burnotesCreate(
            secretKey(id),
            JSON.stringify(encryptedSecret),
            accessTokenHash,
            String(expiresAt),
            String(SECRET_TTL_MS),
        );
        if (result !== 1) {
            return null;
        }
        return { expiresAt };
    }

    async getMetadata(id: string): Promise<{ expiresAt: number } | null> {
        const client = getClient();
        const expiresAt = await client.hget(secretKey(id), 'expiresAt');
        if (!expiresAt) {
            return null;
        }
        return { expiresAt: Number(expiresAt) };
    }

    async consume(id: string, accessTokenHash: string): Promise<EncryptedSecret | null> {
        const client = getClient();
        const result = await client.burnotesConsume(secretKey(id), accessTokenHash, String(MAX_FAILED_ATTEMPTS));
        if (!Array.isArray(result) || result[0] !== 'ok' || typeof result[1] !== 'string') {
            return null;
        }
        try {
            return JSON.parse(result[1]) as EncryptedSecret;
        } catch {
            return null;
        }
    }
}

export const secretStore = new SecretStore();

export const SECRET_TTL_SECONDS = SECRET_TTL_MS / 1000;
