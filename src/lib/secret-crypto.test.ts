import { describe, expect, it } from 'vitest';
import {
    decryptSecret,
    deriveSecretAccessToken,
    deriveSecretId,
    isValidEncryptedSecret,
    prepareSecretUpload,
    readSecretKeyFromHash,
    SECRET_ACCESS_TOKEN_LENGTH,
    SECRET_ID_LENGTH,
    SECRET_IV_LENGTH,
    SECRET_VERSION,
} from '@/lib/secret-crypto';

describe('secret-crypto', () => {
    it('prepares an upload that can be decrypted back to the original secret', async () => {
        const secret = 'line one\nline two\ns3cr3t';
        const prepared = await prepareSecretUpload(secret);

        expect(prepared.id).toHaveLength(SECRET_ID_LENGTH);
        expect(prepared.accessToken).toHaveLength(SECRET_ACCESS_TOKEN_LENGTH);
        expect(prepared.encryptedSecret.version).toBe(SECRET_VERSION);
        expect(prepared.encryptedSecret.iv).toHaveLength(SECRET_IV_LENGTH);
        expect(isValidEncryptedSecret(prepared.encryptedSecret)).toBe(true);
        expect(await deriveSecretId(prepared.key)).toBe(prepared.id);
        expect(await deriveSecretAccessToken(prepared.key)).toBe(prepared.accessToken);
        expect(await decryptSecret(prepared.key, prepared.encryptedSecret)).toBe(secret);
    });

    it('reads the secret key from the hash fragment', () => {
        expect(readSecretKeyFromHash('#abc123')).toBe('abc123');
        expect(readSecretKeyFromHash('plain-fragment')).toBe('plain-fragment');
        expect(readSecretKeyFromHash('#')).toBeNull();
        expect(readSecretKeyFromHash('')).toBeNull();
    });

    it('rejects malformed encrypted payloads', () => {
        expect(
            isValidEncryptedSecret({
                version: SECRET_VERSION,
                iv: 'bad+iv',
                ciphertext: 'ciphertext',
            }),
        ).toBe(false);

        expect(
            isValidEncryptedSecret({
                version: SECRET_VERSION + 1,
                iv: 'a'.repeat(SECRET_IV_LENGTH),
                ciphertext: 'ciphertext',
            }),
        ).toBe(false);
    });
});
