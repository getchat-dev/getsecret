import { describe, expect, it } from 'vitest';
import {
    decryptSecret,
    decryptSecretWithPassword,
    deriveSecretAccessToken,
    deriveSecretId,
    isValidEncryptedSecret,
    prepareSecretUpload,
    prepareSecretUploadWithPassword,
    readSecretKeyFromHash,
    SECRET_ACCESS_TOKEN_LENGTH,
    SECRET_ID_LENGTH,
    SECRET_IV_LENGTH,
    SECRET_VERSION_V1,
    SECRET_VERSION_V2,
} from '@/lib/secret-crypto';

describe('secret-crypto', () => {
    it('prepares an upload that can be decrypted back to the original secret', async () => {
        const secret = 'line one\nline two\ns3cr3t';
        const prepared = await prepareSecretUpload(secret);

        expect(prepared.id).toHaveLength(SECRET_ID_LENGTH);
        expect(prepared.accessToken).toHaveLength(SECRET_ACCESS_TOKEN_LENGTH);
        expect(prepared.encryptedSecret.version).toBe(SECRET_VERSION_V1);
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
                version: SECRET_VERSION_V1,
                iv: 'bad+iv',
                ciphertext: 'ciphertext',
            }),
        ).toBe(false);

        expect(
            isValidEncryptedSecret({
                version: 99,
                iv: 'a'.repeat(SECRET_IV_LENGTH),
                ciphertext: 'ciphertext',
            }),
        ).toBe(false);
    });

    it('accepts v1 and v2 envelopes via the validator', () => {
        expect(
            isValidEncryptedSecret({
                version: SECRET_VERSION_V1,
                iv: 'a'.repeat(SECRET_IV_LENGTH),
                ciphertext: 'ciphertext',
            }),
        ).toBe(true);
        expect(
            isValidEncryptedSecret({
                version: SECRET_VERSION_V2,
                iv: 'a'.repeat(SECRET_IV_LENGTH),
                ciphertext: 'ciphertext',
            }),
        ).toBe(true);
    });

    it('round-trips a password-protected secret with the right password', async () => {
        const secret = 'eyes only · double-encrypted payload';
        const password = 'correct-horse-battery';
        // Use a low iteration count to keep PBKDF2 fast in tests; the boundary
        // is enforced by isValidPasswordIterations (≥100k for prod) but the
        // crypto helpers themselves accept any positive count from this lib.
        const prepared = await prepareSecretUploadWithPassword(secret, password, 100_000);

        expect(prepared.encryptedSecret.version).toBe(SECRET_VERSION_V2);
        expect(prepared.passwordParams.iterations).toBe(100_000);
        expect(prepared.passwordVerifierHash.length).toBeGreaterThan(0);

        const decrypted = await decryptSecretWithPassword(
            prepared.key,
            prepared.encryptedSecret,
            password,
            prepared.passwordParams,
        );
        expect(decrypted).toBe(secret);
    });

    it('rejects a wrong password via inner AES-GCM auth tag', async () => {
        const prepared = await prepareSecretUploadWithPassword('payload', 'right-password', 100_000);
        await expect(
            decryptSecretWithPassword(
                prepared.key,
                prepared.encryptedSecret,
                'wrong-password',
                prepared.passwordParams,
            ),
        ).rejects.toBeDefined();
    });

    it('decryptSecret refuses a v2 envelope', async () => {
        const prepared = await prepareSecretUploadWithPassword('payload', 'a-password-here', 100_000);
        await expect(decryptSecret(prepared.key, prepared.encryptedSecret)).rejects.toThrow(/password/);
    });
});
