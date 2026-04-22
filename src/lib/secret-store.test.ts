import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedSecret } from '@/lib/secret-crypto';
import { secretStore } from '@/lib/secret-store';
import { getValkey } from '@/lib/valkey-client';

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
        expect(await secretStore.getMetadata('secret-id')).toEqual({ expiresAt: created?.expiresAt });
        expect(await secretStore.consume('secret-id', 'wrong-token-hash')).toBeNull();
        expect(await secretStore.getMetadata('secret-id')).toEqual({ expiresAt: created?.expiresAt });
        expect(await secretStore.consume('secret-id', 'token-hash')).toEqual(sampleEncryptedSecret());
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

        expect(await secretStore.consume('grace-secret', 'right-token-hash')).toEqual(sampleEncryptedSecret());
    });

    it('rejects consume when the stored hash has a different length', async () => {
        await secretStore.create('length-check', sampleEncryptedSecret(), 'token-hash-aaaa');
        expect(await secretStore.consume('length-check', 'token-hash-bbbbbbbbbb')).toBeNull();
    });
});
