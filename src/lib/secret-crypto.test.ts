import { describe, expect, it } from 'vitest';
import {
    decodePlaintext,
    decryptSecret,
    decryptSecretToPayload,
    decryptSecretWithPassword,
    decryptSecretWithPasswordToPayload,
    deriveSecretAccessToken,
    deriveSecretId,
    encodePlaintext,
    type FileRef,
    isValidEncryptedSecret,
    prepareSecretUpload,
    prepareSecretUploadEnvelope,
    prepareSecretUploadWithPassword,
    prepareSecretUploadWithPasswordEnvelope,
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

describe('plaintext envelope', () => {
    const fileRef: FileRef = {
        s3Key: 'f/12345678-1234-1234-1234-1234567890ab',
        keyB64: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };

    it('round-trips text-only payload', () => {
        const encoded = encodePlaintext({ text: 'hello' });
        expect(encoded[0]).toBe(0x00);
        expect(decodePlaintext(encoded)).toEqual({ text: 'hello' });
    });

    it('round-trips text + fileRef', () => {
        const encoded = encodePlaintext({ text: 'with attachment', fileRef });
        const decoded = decodePlaintext(encoded);
        expect(decoded).toEqual({ text: 'with attachment', fileRef });
    });

    it('round-trips empty text + fileRef (file-only secret)', () => {
        const encoded = encodePlaintext({ text: '', fileRef });
        expect(decodePlaintext(encoded)).toEqual({ text: '', fileRef });
    });

    it('decodes legacy raw plaintext (no magic byte) as text', () => {
        // Bytes that don't start with 0x00 → treated as raw UTF-8, no fileRef.
        const raw = new TextEncoder().encode('legacy secret');
        expect(decodePlaintext(raw)).toEqual({ text: 'legacy secret' });
    });

    it('decodes empty plaintext as empty text', () => {
        expect(decodePlaintext(new Uint8Array(0))).toEqual({ text: '' });
    });

    it('throws on malformed JSON after the magic byte', () => {
        const bytes = new Uint8Array([0x00, 0x7b, 0x6e, 0x6f, 0x70, 0x65]); // 0x00 + "{nope"
        expect(() => decodePlaintext(bytes)).toThrow(/Malformed/);
    });

    it('throws when envelope JSON is not an object', () => {
        const bytes = new Uint8Array([0x00, ...new TextEncoder().encode('"just-a-string"')]);
        expect(() => decodePlaintext(bytes)).toThrow(/not an object/);
    });

    it('drops fileRef with malformed s3Key (defense-in-depth)', () => {
        const bytes = new Uint8Array([
            0x00,
            ...new TextEncoder().encode(
                JSON.stringify({ text: 't', fileRef: { s3Key: '../etc/passwd', keyB64: 'aaaa' } }),
            ),
        ]);
        expect(decodePlaintext(bytes)).toEqual({ text: 't' });
    });

    it('drops fileRef with non-base64url key', () => {
        const bytes = new Uint8Array([
            0x00,
            ...new TextEncoder().encode(
                JSON.stringify({
                    text: 't',
                    fileRef: { s3Key: 'f/12345678-1234-1234-1234-1234567890ab', keyB64: 'has spaces!' },
                }),
            ),
        ]);
        expect(decodePlaintext(bytes)).toEqual({ text: 't' });
    });

    it('coerces missing text field to empty string', () => {
        const bytes = new Uint8Array([0x00, ...new TextEncoder().encode(JSON.stringify({ fileRef }))]);
        expect(decodePlaintext(bytes)).toEqual({ text: '', fileRef });
    });

    it('round-trips previewImage=true alongside fileRef', () => {
        const encoded = encodePlaintext({ text: 't', fileRef, previewImage: true });
        expect(decodePlaintext(encoded)).toEqual({ text: 't', fileRef, previewImage: true });
    });

    it('drops previewImage when there is no fileRef (flag is meaningless alone)', () => {
        const encoded = encodePlaintext({ text: 't', previewImage: true });
        expect(decodePlaintext(encoded)).toEqual({ text: 't' });
    });

    it('omits previewImage from the wire when it is false / undefined', () => {
        const withFalse = encodePlaintext({ text: 't', fileRef, previewImage: false });
        // The decoded payload must not carry the field at all so callers can
        // rely on plain `payload.previewImage === true` checks.
        expect(decodePlaintext(withFalse)).toEqual({ text: 't', fileRef });
        const withUndefined = encodePlaintext({ text: 't', fileRef });
        expect(decodePlaintext(withUndefined)).toEqual({ text: 't', fileRef });
    });

    it('rejects non-boolean previewImage values (strict true check)', () => {
        // A hostile envelope can't smuggle truthy values past the strict
        // `=== true` check inside decodePlaintext.
        for (const sneaky of ['true', 1, {}, []]) {
            const bytes = new Uint8Array([
                0x00,
                ...new TextEncoder().encode(JSON.stringify({ text: 't', fileRef, previewImage: sneaky })),
            ]);
            expect(decodePlaintext(bytes)).toEqual({ text: 't', fileRef });
        }
    });
});

describe('envelope-aware upload helpers', () => {
    const fileRef: FileRef = {
        s3Key: 'f/00000000-0000-0000-0000-000000000001',
        keyB64: 'KFile-bytes-base64url-encoded-aaaaaaaaaaaaa',
    };

    it('encrypts an envelope (text + fileRef) and decrypts back to the same payload', async () => {
        const payload = { text: 'open me', fileRef };
        const prepared = await prepareSecretUploadEnvelope(payload);

        expect(prepared.encryptedSecret.version).toBe(SECRET_VERSION_V1);
        expect(await decryptSecretToPayload(prepared.key, prepared.encryptedSecret)).toEqual(payload);
    });

    it('legacy prepareSecretUpload + decryptSecretToPayload returns text without fileRef', async () => {
        const prepared = await prepareSecretUpload('plain legacy text');
        const decoded = await decryptSecretToPayload(prepared.key, prepared.encryptedSecret);
        expect(decoded.text).toBe('plain legacy text');
        expect(decoded.fileRef).toBeUndefined();
    });

    it('envelope-wrapped secret is still readable via the string-only decryptSecret API', async () => {
        const prepared = await prepareSecretUploadEnvelope({ text: 'hi', fileRef });
        expect(await decryptSecret(prepared.key, prepared.encryptedSecret)).toBe('hi');
    });

    it('password-protected envelope round-trips with fileRef intact', async () => {
        const payload = { text: 'sensitive', fileRef };
        const prepared = await prepareSecretUploadWithPasswordEnvelope(payload, 'pw-pw-pw-pw', 100_000);

        expect(prepared.encryptedSecret.version).toBe(SECRET_VERSION_V2);
        const decoded = await decryptSecretWithPasswordToPayload(
            prepared.key,
            prepared.encryptedSecret,
            'pw-pw-pw-pw',
            prepared.passwordParams,
        );
        expect(decoded).toEqual(payload);
    });

    it('wrong password on envelope-wrapped v2 fails (fileRef stays sealed)', async () => {
        const prepared = await prepareSecretUploadWithPasswordEnvelope({ text: 'x', fileRef }, 'correct-pass', 100_000);
        await expect(
            decryptSecretWithPasswordToPayload(
                prepared.key,
                prepared.encryptedSecret,
                'wrong-pass',
                prepared.passwordParams,
            ),
        ).rejects.toBeDefined();
    });

    it('password-protected envelope readable via legacy decryptSecretWithPassword (text only)', async () => {
        const prepared = await prepareSecretUploadWithPasswordEnvelope(
            { text: 'just-text', fileRef },
            'p4-p4-p4',
            100_000,
        );
        const text = await decryptSecretWithPassword(
            prepared.key,
            prepared.encryptedSecret,
            'p4-p4-p4',
            prepared.passwordParams,
        );
        expect(text).toBe('just-text');
    });
});
