import type { Redis } from 'ioredis';
import { DEFAULT_EXPIRATION_SECONDS } from '@/lib/expiration';
import { DEFAULT_MAX_VIEWS, isValidMaxViews } from '@/lib/max-views';
import { isValidPasswordIterations, isValidPasswordSalt, type PasswordParams } from '@/lib/password-derive';
import type { EncryptedSecret } from '@/lib/secret-crypto';
import { DEFAULT_SECRET_FORMAT, isSecretFormat, type SecretFormat } from '@/lib/secret-formats';
import { getValkey, SECRET_KEY_PREFIX } from '@/lib/valkey-client';

const MAX_FAILED_ATTEMPTS = 5;

// ARGV[10] = fileS3Key, ARGV[11] = fileSize. Both are optional (empty string =
// not set); when present they bind a server-allocated S3 object to this
// secret. The file lives on S3 as an opaque encrypted container; the server
// only stores the key + size for cleanup and presigning.
const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
    return 0
end
redis.call('HSET', KEYS[1],
    'encryptedSecret', ARGV[1],
    'accessTokenHash', ARGV[2],
    'expiresAt', ARGV[3],
    'failedAttempts', '0',
    'format', ARGV[5],
    'maxViews', ARGV[6],
    'viewsUsed', '0',
    'passwordSalt', ARGV[7],
    'passwordIterations', ARGV[8],
    'passwordVerifierHash', ARGV[9])
if ARGV[10] ~= '' then
    redis.call('HSET', KEYS[1], 'fileS3Key', ARGV[10], 'fileSize', ARGV[11])
end
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return 1
`;

// Constant-time compare inside the script: we always read the stored hash,
// always iterate the full length on match, and always HINCRBY on miss — so an
// attacker cannot distinguish "missing" from "wrong token" from "wrong length"
// through a timing oracle on the Valkey round trip.
//
// Stage 4 extension: if the secret was created with a password, the hash also
// holds passwordVerifierHash. When non-empty, the script does a SECOND
// constant-time compare against ARGV[3] (the verifier hash sent by the
// client, hashed once more by the route handler) — same lockout counter, no
// timing distinction between wrong-token and wrong-password. View counter is
// only bumped after BOTH checks pass.
//
// On the success path we bump viewsUsed and DEL the record once it reaches
// maxViews. maxViews encoding in the hash: positive integer = that limit;
// '-1' = unlimited; missing field (v1 backward-compat for secrets created
// before stage 3) = 1. passwordVerifierHash empty/missing = no password
// required (v1 secrets and stage-3 secrets without password).
const OPEN_SCRIPT = `
local stored = redis.call('HGET', KEYS[1], 'accessTokenHash')
if not stored then
    return {'missing'}
end
local tokenDiff = 0
if #stored == #ARGV[1] then
    for i = 1, #stored do
        local a = string.byte(stored, i)
        local b = string.byte(ARGV[1], i)
        tokenDiff = tokenDiff + (a - b) * (a - b)
    end
else
    tokenDiff = 1
end
local storedPwHash = redis.call('HGET', KEYS[1], 'passwordVerifierHash')
local pwDiff = 0
if storedPwHash and storedPwHash ~= '' then
    local providedPwHash = ARGV[3] or ''
    if #storedPwHash == #providedPwHash and #providedPwHash > 0 then
        for i = 1, #storedPwHash do
            local a = string.byte(storedPwHash, i)
            local b = string.byte(providedPwHash, i)
            pwDiff = pwDiff + (a - b) * (a - b)
        end
    else
        pwDiff = 1
    end
end
if tokenDiff + pwDiff > 0 then
    local failed = redis.call('HINCRBY', KEYS[1], 'failedAttempts', 1)
    if failed >= tonumber(ARGV[2]) then
        redis.call('DEL', KEYS[1])
    end
    return {'mismatch'}
end
local encrypted = redis.call('HGET', KEYS[1], 'encryptedSecret')
local format = redis.call('HGET', KEYS[1], 'format') or ''
local fileS3Key = redis.call('HGET', KEYS[1], 'fileS3Key') or ''
local maxViewsRaw = redis.call('HGET', KEYS[1], 'maxViews')
local maxViews
if maxViewsRaw == false or maxViewsRaw == nil then
    maxViews = 1
else
    maxViews = tonumber(maxViewsRaw)
    if maxViews == nil then
        maxViews = 1
    elseif maxViews ~= -1 and maxViews < 1 then
        maxViews = 1
    end
end
local viewsUsed = redis.call('HINCRBY', KEYS[1], 'viewsUsed', 1)
local viewsRemaining
local destroyed = '0'
if maxViews == -1 then
    viewsRemaining = -1
else
    viewsRemaining = maxViews - viewsUsed
    if viewsRemaining < 0 then
        viewsRemaining = 0
    end
    if viewsUsed >= maxViews then
        redis.call('DEL', KEYS[1])
        destroyed = '1'
    end
end
return {'ok', encrypted, format, tostring(viewsRemaining), fileS3Key, destroyed}
`;

type BurnotesCommands = {
    burnotesCreate: (...args: (string | number)[]) => Promise<number>;
    burnotesOpen: (
        ...args: (string | number)[]
    ) => Promise<
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
    >;
};

const registered = new WeakSet<Redis>();

function getClient(): Redis & BurnotesCommands {
    const client = getValkey();
    if (!registered.has(client)) {
        client.defineCommand('burnotesCreate', { numberOfKeys: 1, lua: CREATE_SCRIPT });
        client.defineCommand('burnotesOpen', { numberOfKeys: 1, lua: OPEN_SCRIPT });
        registered.add(client);
    }
    return client as Redis & BurnotesCommands;
}

function secretKey(id: string): string {
    return `${SECRET_KEY_PREFIX}${id}`;
}

function encodeMaxViews(value: number | null): string {
    return value === null ? '-1' : String(value);
}

function decodeStoredMaxViews(raw: string | null): number | null {
    if (raw === null) return DEFAULT_MAX_VIEWS;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed)) return DEFAULT_MAX_VIEWS;
    if (parsed === -1) return null;
    if (parsed < 1) return DEFAULT_MAX_VIEWS;
    return parsed;
}

function decodeStoredPasswordParams(saltRaw: string | null, iterationsRaw: string | null): PasswordParams | null {
    if (!saltRaw || !iterationsRaw) return null;
    const iterations = Number.parseInt(iterationsRaw, 10);
    if (!isValidPasswordSalt(saltRaw) || !isValidPasswordIterations(iterations)) return null;
    return { salt: saltRaw, iterations };
}

export type SecretMetadata = {
    expiresAt: number;
    maxViews: number | null;
    viewsUsed: number;
    passwordParams: PasswordParams | null;
};

export type ConsumedSecret = {
    encryptedSecret: EncryptedSecret;
    format: SecretFormat;
    viewsRemaining: number | null;
    fileS3Key: string | null;
    destroyed: boolean;
};

export type FileAttachment = {
    s3Key: string;
    size: number;
};

class SecretStore {
    async create(
        id: string,
        encryptedSecret: EncryptedSecret,
        accessTokenHash: string,
        ttlSeconds: number = DEFAULT_EXPIRATION_SECONDS,
        format: SecretFormat = DEFAULT_SECRET_FORMAT,
        maxViews: number | null = DEFAULT_MAX_VIEWS,
        passwordParams: PasswordParams | null = null,
        passwordVerifierHash: string | null = null,
        file: FileAttachment | null = null,
    ): Promise<{ expiresAt: number } | null> {
        if (!isValidMaxViews(maxViews)) return null;
        // passwordParams and passwordVerifierHash must be set together or both omitted.
        if (passwordParams === null) {
            if (passwordVerifierHash) return null;
        } else {
            if (
                !isValidPasswordSalt(passwordParams.salt) ||
                !isValidPasswordIterations(passwordParams.iterations) ||
                typeof passwordVerifierHash !== 'string' ||
                passwordVerifierHash.length === 0
            ) {
                return null;
            }
        }
        if (file !== null) {
            if (typeof file.s3Key !== 'string' || file.s3Key.length === 0) return null;
            if (!Number.isInteger(file.size) || file.size <= 0) return null;
        }

        const client = getClient();
        const ttlMs = ttlSeconds * 1000;
        const expiresAt = Date.now() + ttlMs;
        const result = await client.burnotesCreate(
            secretKey(id),
            JSON.stringify(encryptedSecret),
            accessTokenHash,
            String(expiresAt),
            String(ttlMs),
            format,
            encodeMaxViews(maxViews),
            passwordParams ? passwordParams.salt : '',
            passwordParams ? String(passwordParams.iterations) : '',
            passwordVerifierHash ?? '',
            file ? file.s3Key : '',
            file ? String(file.size) : '',
        );
        if (result !== 1) {
            return null;
        }
        return { expiresAt };
    }

    async getMetadata(id: string): Promise<SecretMetadata | null> {
        const client = getClient();
        const fields = await client.hmget(
            secretKey(id),
            'expiresAt',
            'maxViews',
            'viewsUsed',
            'passwordSalt',
            'passwordIterations',
        );
        const [expiresAtRaw, maxViewsRaw, viewsUsedRaw, passwordSaltRaw, passwordIterationsRaw] = fields;
        if (!expiresAtRaw) {
            return null;
        }
        const viewsUsed = viewsUsedRaw ? Number.parseInt(viewsUsedRaw, 10) : 0;
        return {
            expiresAt: Number(expiresAtRaw),
            maxViews: decodeStoredMaxViews(maxViewsRaw),
            viewsUsed: Number.isFinite(viewsUsed) ? viewsUsed : 0,
            passwordParams: decodeStoredPasswordParams(passwordSaltRaw, passwordIterationsRaw),
        };
    }

    async consume(
        id: string,
        accessTokenHash: string,
        passwordVerifierHash: string | null = null,
    ): Promise<ConsumedSecret | null> {
        const client = getClient();
        const result = await client.burnotesOpen(
            secretKey(id),
            accessTokenHash,
            String(MAX_FAILED_ATTEMPTS),
            passwordVerifierHash ?? '',
        );
        if (!Array.isArray(result) || result[0] !== 'ok' || typeof result[1] !== 'string') {
            return null;
        }
        let encryptedSecret: EncryptedSecret;
        try {
            encryptedSecret = JSON.parse(result[1]) as EncryptedSecret;
        } catch {
            return null;
        }
        const rawFormat = result[2];
        const format: SecretFormat = isSecretFormat(rawFormat) ? rawFormat : DEFAULT_SECRET_FORMAT;
        const rawRemaining = result[3];
        const parsedRemaining = typeof rawRemaining === 'string' ? Number.parseInt(rawRemaining, 10) : Number.NaN;
        const viewsRemaining: number | null =
            !Number.isInteger(parsedRemaining) || parsedRemaining < 0 ? null : parsedRemaining;
        const rawFileKey = typeof result[4] === 'string' ? result[4] : '';
        const fileS3Key = rawFileKey.length > 0 ? rawFileKey : null;
        const destroyed = result[5] === '1';
        return { encryptedSecret, format, viewsRemaining, fileS3Key, destroyed };
    }
}

export const secretStore = new SecretStore();

export const SECRET_TTL_SECONDS = DEFAULT_EXPIRATION_SECONDS;
