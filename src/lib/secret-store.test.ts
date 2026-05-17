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
            passwordParams: null,
        });
        expect(await secretStore.consume('secret-id', 'wrong-token-hash')).toBeNull();
        expect(await secretStore.getMetadata('secret-id')).toEqual({
            expiresAt: created?.expiresAt,
            maxViews: 1,
            viewsUsed: 0,
            passwordParams: null,
        });
        expect(await secretStore.consume('secret-id', 'token-hash')).toEqual({
            encryptedSecret: sampleEncryptedSecret(),
            format: 'plain',
            viewsRemaining: 0,
            fileS3Key: null,
            destroyed: true,
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
            fileS3Key: null,
            destroyed: true,
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
            fileS3Key: null,
            destroyed: true,
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
            fileS3Key: null,
            destroyed: true,
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
            fileS3Key: null,
            destroyed: true,
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
            fileS3Key: null,
            destroyed: true,
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

    it('requires the verifier hash to consume a password-protected secret', async () => {
        const passwordParams = { salt: 'a'.repeat(22), iterations: 200_000 };
        const verifierHash = 'b'.repeat(43);
        const created = await secretStore.create(
            'pw-secret',
            sampleEncryptedSecret(),
            'token-hash',
            undefined,
            'plain',
            1,
            passwordParams,
            verifierHash,
        );
        expect(created).not.toBeNull();

        const meta = await secretStore.getMetadata('pw-secret');
        expect(meta?.passwordParams).toEqual(passwordParams);

        // Right token, no verifier → mismatch (counts toward lockout).
        expect(await secretStore.consume('pw-secret', 'token-hash')).toBeNull();
        // Right token, wrong verifier → mismatch.
        expect(await secretStore.consume('pw-secret', 'token-hash', 'c'.repeat(43))).toBeNull();
        // Right token + right verifier → success and DEL.
        const consumed = await secretStore.consume('pw-secret', 'token-hash', verifierHash);
        expect(consumed).not.toBeNull();
        expect(await secretStore.getMetadata('pw-secret')).toBeNull();
    });

    it('counts wrong-password attempts toward the same lockout as wrong-token', async () => {
        const passwordParams = { salt: 'a'.repeat(22), iterations: 200_000 };
        const verifierHash = 'b'.repeat(43);
        await secretStore.create(
            'pw-lockout',
            sampleEncryptedSecret(),
            'token-hash',
            undefined,
            'plain',
            1,
            passwordParams,
            verifierHash,
        );
        // Five wrong verifier attempts in a row → secret deleted.
        for (let i = 0; i < 5; i += 1) {
            expect(await secretStore.consume('pw-lockout', 'token-hash', 'c'.repeat(43))).toBeNull();
        }
        expect(await secretStore.getMetadata('pw-lockout')).toBeNull();
        expect(await secretStore.consume('pw-lockout', 'token-hash', verifierHash)).toBeNull();
    });

    it('combines password protection with multi-view counting', async () => {
        const passwordParams = { salt: 'a'.repeat(22), iterations: 200_000 };
        const verifierHash = 'b'.repeat(43);
        await secretStore.create(
            'pw-multi',
            sampleEncryptedSecret(),
            'token-hash',
            undefined,
            'plain',
            3,
            passwordParams,
            verifierHash,
        );

        for (const expected of [2, 1, 0]) {
            const consumed = await secretStore.consume('pw-multi', 'token-hash', verifierHash);
            expect(consumed?.viewsRemaining).toBe(expected);
        }
        expect(await secretStore.consume('pw-multi', 'token-hash', verifierHash)).toBeNull();
    });

    it('does not require a verifier for non-password secrets even if one is sent', async () => {
        // v1-style behavior: backwards-compat for clients that send an empty
        // string verifier or a stray value. The Lua script only enforces the
        // verifier when the stored hash is non-empty.
        await secretStore.create('plain-secret', sampleEncryptedSecret(), 'token-hash');
        const consumed = await secretStore.consume('plain-secret', 'token-hash', 'unused-verifier');
        expect(consumed).not.toBeNull();
    });

    it('rejects mixed password params (params without verifier hash, or vice versa)', async () => {
        const passwordParams = { salt: 'a'.repeat(22), iterations: 200_000 };
        // Params without verifierHash.
        expect(
            await secretStore.create(
                'bad-mix-1',
                sampleEncryptedSecret(),
                'token-hash',
                undefined,
                'plain',
                1,
                passwordParams,
                null,
            ),
        ).toBeNull();
        // verifierHash without params.
        expect(
            await secretStore.create(
                'bad-mix-2',
                sampleEncryptedSecret(),
                'token-hash',
                undefined,
                'plain',
                1,
                null,
                'b'.repeat(43),
            ),
        ).toBeNull();
    });

    describe('file attachments', () => {
        const fileAttachment = { s3Key: 'f/12345678-1234-1234-1234-1234567890ab', size: 4096 };

        it('persists fileS3Key/fileSize and returns them on consume', async () => {
            const created = await secretStore.create(
                'file-secret',
                sampleEncryptedSecret(),
                'token-hash',
                undefined,
                'plain',
                1,
                null,
                null,
                fileAttachment,
            );
            expect(created).not.toBeNull();

            // Raw hash fields should carry the file binding.
            const stored = await getValkey().hmget(`${SECRET_KEY_PREFIX}file-secret`, 'fileS3Key', 'fileSize');
            expect(stored).toEqual([fileAttachment.s3Key, String(fileAttachment.size)]);

            const consumed = await secretStore.consume('file-secret', 'token-hash');
            expect(consumed).toEqual({
                encryptedSecret: sampleEncryptedSecret(),
                format: 'plain',
                viewsRemaining: 0,
                fileS3Key: fileAttachment.s3Key,
                destroyed: true,
            });
        });

        it('does not set file fields for text-only secrets', async () => {
            await secretStore.create('text-only', sampleEncryptedSecret(), 'token-hash');
            const stored = await getValkey().hmget(`${SECRET_KEY_PREFIX}text-only`, 'fileS3Key', 'fileSize');
            expect(stored).toEqual([null, null]);

            const consumed = await secretStore.consume('text-only', 'token-hash');
            expect(consumed?.fileS3Key).toBeNull();
        });

        it('reports destroyed=true only on the consume that crosses maxViews', async () => {
            await secretStore.create(
                'mv-destroyed',
                sampleEncryptedSecret(),
                'token-hash',
                undefined,
                'plain',
                3,
                null,
                null,
                fileAttachment,
            );
            const first = await secretStore.consume('mv-destroyed', 'token-hash');
            expect(first?.destroyed).toBe(false);
            expect(first?.fileS3Key).toBe(fileAttachment.s3Key);

            const second = await secretStore.consume('mv-destroyed', 'token-hash');
            expect(second?.destroyed).toBe(false);
            expect(second?.fileS3Key).toBe(fileAttachment.s3Key);

            const third = await secretStore.consume('mv-destroyed', 'token-hash');
            expect(third?.destroyed).toBe(true);
            expect(third?.fileS3Key).toBe(fileAttachment.s3Key);
        });

        it('reports destroyed=false on every consume of an unlimited secret', async () => {
            await secretStore.create(
                'unlimited-file',
                sampleEncryptedSecret(),
                'token-hash',
                undefined,
                'plain',
                null,
                null,
                null,
                fileAttachment,
            );
            for (let i = 0; i < 5; i += 1) {
                const consumed = await secretStore.consume('unlimited-file', 'token-hash');
                expect(consumed?.destroyed).toBe(false);
                expect(consumed?.fileS3Key).toBe(fileAttachment.s3Key);
            }
            // Record still exists.
            expect(await secretStore.getMetadata('unlimited-file')).not.toBeNull();
        });

        it('rejects creation with empty s3Key', async () => {
            const result = await secretStore.create(
                'bad-s3-key',
                sampleEncryptedSecret(),
                'token-hash',
                undefined,
                'plain',
                1,
                null,
                null,
                { s3Key: '', size: 100 },
            );
            expect(result).toBeNull();
        });

        it('rejects creation with non-positive file size', async () => {
            expect(
                await secretStore.create(
                    'zero-size',
                    sampleEncryptedSecret(),
                    'token-hash',
                    undefined,
                    'plain',
                    1,
                    null,
                    null,
                    { s3Key: 'f/abc', size: 0 },
                ),
            ).toBeNull();
            expect(
                await secretStore.create(
                    'neg-size',
                    sampleEncryptedSecret(),
                    'token-hash',
                    undefined,
                    'plain',
                    1,
                    null,
                    null,
                    { s3Key: 'f/abc', size: -1 },
                ),
            ).toBeNull();
            expect(
                await secretStore.create(
                    'nan-size',
                    sampleEncryptedSecret(),
                    'token-hash',
                    undefined,
                    'plain',
                    1,
                    null,
                    null,
                    { s3Key: 'f/abc', size: Number.NaN },
                ),
            ).toBeNull();
        });

        it('falls back to no-file when OPEN script reads a hash without fileS3Key (v1 legacy)', async () => {
            // Legacy record predating the file-attachments feature: no
            // fileS3Key field at all. Script should return empty string and
            // the store layer should surface fileS3Key=null.
            const client = getValkey();
            const key = `${SECRET_KEY_PREFIX}legacy-no-file`;
            await client.hset(key, {
                encryptedSecret: JSON.stringify(sampleEncryptedSecret()),
                accessTokenHash: 'token-hash',
                expiresAt: String(Date.now() + 60_000),
                failedAttempts: '0',
                format: 'plain',
                maxViews: '1',
                viewsUsed: '0',
            });
            const consumed = await secretStore.consume('legacy-no-file', 'token-hash');
            expect(consumed?.fileS3Key).toBeNull();
            expect(consumed?.destroyed).toBe(true);
        });
    });
});
