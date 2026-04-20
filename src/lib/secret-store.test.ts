import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedSecret } from '@/lib/secret-crypto';
import { secretStore } from '@/lib/secret-store';

const TEST_TTL_MS = 24 * 60 * 60 * 1000;

type SecretStoreInternals = {
    store: Map<string, unknown>;
};

function getStore() {
    return (secretStore as unknown as SecretStoreInternals).store;
}

function sampleEncryptedSecret(): EncryptedSecret {
    return {
        version: 1,
        iv: 'a'.repeat(16),
        ciphertext: 'ciphertext',
    };
}

describe('secret-store', () => {
    beforeEach(() => {
        getStore().clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        getStore().clear();
    });

    it('stores secrets, exposes metadata, and consumes them exactly once', () => {
        const created = secretStore.create('secret-id', sampleEncryptedSecret(), 'token-hash');

        expect(created).not.toBeNull();
        expect(secretStore.getMetadata('secret-id')).toEqual({ expiresAt: created?.expiresAt });
        expect(secretStore.consume('secret-id', 'wrong-token-hash')).toBeNull();
        expect(secretStore.getMetadata('secret-id')).toEqual({ expiresAt: created?.expiresAt });
        expect(secretStore.consume('secret-id', 'token-hash')).toEqual(sampleEncryptedSecret());
        expect(secretStore.consume('secret-id', 'token-hash')).toBeNull();
    });

    it('removes expired secrets when the store is touched again', () => {
        const nowSpy = vi.spyOn(Date, 'now');
        const baseTime = 1_700_000_000_000;

        nowSpy.mockReturnValue(baseTime);
        secretStore.create('expiring-secret', sampleEncryptedSecret(), 'token-hash');

        nowSpy.mockReturnValue(baseTime + TEST_TTL_MS + 1);
        expect(secretStore.getMetadata('expiring-secret')).toBeNull();
        expect(getStore().size).toBe(0);
    });

    it('evicts a secret after too many wrong access-token attempts', () => {
        secretStore.create('locked-secret', sampleEncryptedSecret(), 'right-token-hash');

        for (let attempt = 0; attempt < 5; attempt += 1) {
            expect(secretStore.consume('locked-secret', 'wrong-token-hash')).toBeNull();
        }

        expect(getStore().has('locked-secret')).toBe(false);
        expect(secretStore.consume('locked-secret', 'right-token-hash')).toBeNull();
    });

    it('tolerates a few wrong attempts before the correct token succeeds', () => {
        secretStore.create('grace-secret', sampleEncryptedSecret(), 'right-token-hash');

        for (let attempt = 0; attempt < 3; attempt += 1) {
            expect(secretStore.consume('grace-secret', 'wrong-token-hash')).toBeNull();
        }

        expect(secretStore.consume('grace-secret', 'right-token-hash')).toEqual(sampleEncryptedSecret());
    });

    it('compares access-token hashes with constant-time semantics (length mismatch rejected)', () => {
        secretStore.create('length-check', sampleEncryptedSecret(), 'token-hash-aaaa');
        expect(secretStore.consume('length-check', 'token-hash-bbbbbbbbbb')).toBeNull();
    });
});
