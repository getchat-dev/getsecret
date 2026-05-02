import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_EXPIRATION_SECONDS } from '@/lib/expiration';
import type { EncryptedSecret } from '@/lib/secret-crypto';
import { secretStore } from '@/lib/secret-store';
import { getValkey, SECRET_KEY_PREFIX } from '@/lib/valkey-client';

function sampleEncryptedSecret(): EncryptedSecret {
    return {
        version: 1,
        iv: 'a'.repeat(16),
        ciphertext: 'ciphertext',
    };
}

describe('secret-store', () => {
    beforeEach(async () => {
        await getValkey().flushall();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await getValkey().flushall();
    });

    it('stores secrets, exposes metadata, and consumes them exactly once', async () => {
        const created = await secretStore.create('secret-id', sampleEncryptedSecret(), 'token-hash');

        expect(created).not.toBeNull();
        expect(await secretStore.getMetadata('secret-id')).toEqual({
            expiresAt: created?.expiresAt,
            maxViews: 1,
            viewsUsed: 0,
        });
        expect(await secretStore.consume('secret-id', 'wrong-token-hash')).toBeNull();
        expect(await secretStore.getMetadata('secret-id')).toEqual({
            expiresAt: created?.expiresAt,
            maxViews: 1,
            viewsUsed: 0,
        });
        expect(await secretStore.consume('secret-id', 'token-hash')).toEqual({
            encryptedSecret: sampleEncryptedSecret(),
            format: 'plain',
            viewsRemaining: 0,
        });
        expect(await secretStore.consume('secret-id', 'token-hash')).toBeNull();
    });

    it('rejects creating a secret with a duplicate id', async () => {
        const first = await secretStore.create('dup-id', sampleEncryptedSecret(), 'token-hash');
        expect(first).not.toBeNull();

        const second = await secretStore.create('dup-id', sampleEncryptedSecret(), 'another-hash');
        expect(second).toBeNull();
    });

    it('evicts a secret after too many wrong access-token attempts', async () => {
        await secretStore.create('locked-secret', sampleEncryptedSecret(), 'right-token-hash');

        for (let attempt = 0; attempt < 5; attempt += 1) {
            expect(await secretStore.consume('locked-secret', 'wrong-token-hash')).toBeNull();
        }

        expect(await secretStore.getMetadata('locked-secret')).toBeNull();
        expect(await secretStore.consume('locked-secret', 'right-token-hash')).toBeNull();
    });

    it('tolerates a few wrong attempts before the correct token succeeds', async () => {
        await secretStore.create('grace-secret', sampleEncryptedSecret(), 'right-token-hash');

        for (let attempt = 0; attempt < 3; attempt += 1) {
            expect(await secretStore.consume('grace-secret', 'wrong-token-hash')).toBeNull();
        }

        expect(await secretStore.consume('grace-secret', 'right-token-hash')).toEqual({
            encryptedSecret: sampleEncryptedSecret(),
            format: 'plain',
            viewsRemaining: 0,
        });
    });

    it('rejects consume when the stored hash has a different length', async () => {
        await secretStore.create('length-check', sampleEncryptedSecret(), 'token-hash-aaaa');
        expect(await secretStore.consume('length-check', 'token-hash-bbbbbbbbbb')).toBeNull();
    });

    it('applies a custom ttlSeconds to the stored record', async () => {
        const customTtl = 2 * 60 * 60;
        const created = await secretStore.create('custom-ttl', sampleEncryptedSecret(), 'token-hash', customTtl);

        expect(created).not.toBeNull();
        const pttl = await getValkey().pttl(`${SECRET_KEY_PREFIX}custom-ttl`);
        expect(pttl).toBeGreaterThan(0);
        expect(pttl).toBeLessThanOrEqual(customTtl * 1000);
        expect(pttl).toBeGreaterThan(customTtl * 1000 - 5000);
    });

    it('round-trips a non-default format on consume', async () => {
        await secretStore.create('fmt-secret', sampleEncryptedSecret(), 'token-hash', undefined, 'json');
        expect(await secretStore.consume('fmt-secret', 'token-hash')).toEqual({
            encryptedSecret: sampleEncryptedSecret(),
            format: 'json',
            viewsRemaining: 0,
        });
    });

    it('falls back to plain format for legacy records without a format field', async () => {
        const client = getValkey();
        const key = `${SECRET_KEY_PREFIX}legacy-secret`;
        await client.hset(key, {
            encryptedSecret: JSON.stringify(sampleEncryptedSecret()),
            accessTokenHash: 'token-hash',
            expiresAt: String(Date.now() + 60_000),
            failedAttempts: '0',
        });
        expect(await secretStore.consume('legacy-secret', 'token-hash')).toEqual({
            encryptedSecret: sampleEncryptedSecret(),
            format: 'plain',
            viewsRemaining: 0,
        });
    });

    it('falls back to plain format when the stored format is not in the allowlist', async () => {
        const client = getValkey();
        const key = `${SECRET_KEY_PREFIX}weird-secret`;
        await client.hset(key, {
            encryptedSecret: JSON.stringify(sampleEncryptedSecret()),
            accessTokenHash: 'token-hash',
            expiresAt: String(Date.now() + 60_000),
            failedAttempts: '0',
            format: 'cobol',
        });
        expect(await secretStore.consume('weird-secret', 'token-hash')).toEqual({
            encryptedSecret: sampleEncryptedSecret(),
            format: 'plain',
            viewsRemaining: 0,
        });
    });

    it('treats a v1 record with no maxViews/viewsUsed fields as single-use', async () => {
        const client = getValkey();
        const key = `${SECRET_KEY_PREFIX}v1-secret`;
        await client.hset(key, {
            encryptedSecret: JSON.stringify(sampleEncryptedSecret()),
            accessTokenHash: 'token-hash',
            expiresAt: String(Date.now() + 60_000),
            failedAttempts: '0',
            format: 'plain',
        });
        // First consume succeeds and reports zero remaining (legacy single-read).
        expect(await secretStore.consume('v1-secret', 'token-hash')).toEqual({
            encryptedSecret: sampleEncryptedSecret(),
            format: 'plain',
            viewsRemaining: 0,
        });
        expect(await secretStore.consume('v1-secret', 'token-hash')).toBeNull();
    });

    it('consumes a multi-view secret exactly maxViews times and reports remaining count', async () => {
        await secretStore.create('triple', sampleEncryptedSecret(), 'token-hash', undefined, 'plain', 3);

        expect((await secretStore.consume('triple', 'token-hash'))?.viewsRemaining).toBe(2);
        expect((await secretStore.consume('triple', 'token-hash'))?.viewsRemaining).toBe(1);
        expect((await secretStore.consume('triple', 'token-hash'))?.viewsRemaining).toBe(0);
        expect(await secretStore.consume('triple', 'token-hash')).toBeNull();
    });

    it('reports viewsRemaining as null for an unlimited secret and survives many consumes', async () => {
        await secretStore.create('unlimited', sampleEncryptedSecret(), 'token-hash', undefined, 'plain', null);

        for (let i = 0; i < 12; i += 1) {
            expect((await secretStore.consume('unlimited', 'token-hash'))?.viewsRemaining).toBeNull();
        }
        const meta = await secretStore.getMetadata('unlimited');
        expect(meta?.maxViews).toBeNull();
        expect(meta?.viewsUsed).toBe(12);
    });

    it('does not increment viewsUsed when the access token is wrong', async () => {
        await secretStore.create('mv-locked', sampleEncryptedSecret(), 'right-token', undefined, 'plain', 5);

        for (let i = 0; i < 3; i += 1) {
            expect(await secretStore.consume('mv-locked', 'wrong-token')).toBeNull();
        }
        const meta = await secretStore.getMetadata('mv-locked');
        expect(meta?.viewsUsed).toBe(0);
        // The full 5 reads remain available with the right token.
        for (let i = 4; i >= 0; i -= 1) {
            expect((await secretStore.consume('mv-locked', 'right-token'))?.viewsRemaining).toBe(i);
        }
        expect(await secretStore.consume('mv-locked', 'right-token')).toBeNull();
    });

    it('lockout deletes the secret even on a multi-view record', async () => {
        await secretStore.create('mv-burn', sampleEncryptedSecret(), 'right-token', undefined, 'plain', 10);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            expect(await secretStore.consume('mv-burn', 'wrong-token')).toBeNull();
        }
        expect(await secretStore.getMetadata('mv-burn')).toBeNull();
        expect(await secretStore.consume('mv-burn', 'right-token')).toBeNull();
    });

    it('rejects creation with an invalid maxViews value', async () => {
        const result = await secretStore.create(
            'bad-mv',
            sampleEncryptedSecret(),
            'token-hash',
            undefined,
            'plain',
            // @ts-expect-error testing runtime validation
            'three',
        );
        expect(result).toBeNull();
    });

    it('exposes MAX_EXPIRATION_SECONDS as a positive integer', () => {
        expect(Number.isInteger(MAX_EXPIRATION_SECONDS)).toBe(true);
        expect(MAX_EXPIRATION_SECONDS).toBeGreaterThan(0);
    });
});
