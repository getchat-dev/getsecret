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
});
