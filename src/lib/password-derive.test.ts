import { describe, expect, it } from 'vitest';
import {
    computePasswordVerifier,
    derivePasswordKey,
    encodePasswordSalt,
    generatePasswordSalt,
    hashPasswordVerifier,
    isValidPasswordIterations,
    isValidPasswordParams,
    isValidPasswordSalt,
    isValidPasswordVerifier,
    isValidPasswordVerifierHash,
    PASSWORD_KEY_BYTES,
    PASSWORD_MAX_ITERATIONS,
    PASSWORD_MIN_ITERATIONS,
    PASSWORD_PBKDF2_ITERATIONS,
    PASSWORD_SALT_BYTES,
} from '@/lib/password-derive';

describe('password-derive', () => {
    it('produces a deterministic key for the same password + salt + iterations', async () => {
        const salt = new Uint8Array(PASSWORD_SALT_BYTES).fill(7);
        const a = await derivePasswordKey('horse-battery-staple', salt, 100_000);
        const b = await derivePasswordKey('horse-battery-staple', salt, 100_000);
        expect(a.length).toBe(PASSWORD_KEY_BYTES);
        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('produces a different key for a different password', async () => {
        const salt = new Uint8Array(PASSWORD_SALT_BYTES).fill(7);
        const a = await derivePasswordKey('right-password', salt, 100_000);
        const b = await derivePasswordKey('wrong-password', salt, 100_000);
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('produces a different key for a different salt', async () => {
        const password = 'horse-battery-staple';
        const a = await derivePasswordKey(password, new Uint8Array(PASSWORD_SALT_BYTES).fill(1), 100_000);
        const b = await derivePasswordKey(password, new Uint8Array(PASSWORD_SALT_BYTES).fill(2), 100_000);
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('hashes a verifier into a different value (server-side second hash)', async () => {
        const inner = new Uint8Array(PASSWORD_KEY_BYTES).fill(9);
        const verifier = await computePasswordVerifier(inner);
        const verifierHash = await hashPasswordVerifier(verifier);
        expect(verifierHash).not.toBe(verifier);
        expect(isValidPasswordVerifier(verifier)).toBe(true);
        expect(isValidPasswordVerifierHash(verifierHash)).toBe(true);
    });

    it('verifier derives deterministically from inner key', async () => {
        const inner = new Uint8Array(PASSWORD_KEY_BYTES).fill(5);
        const a = await computePasswordVerifier(inner);
        const b = await computePasswordVerifier(inner);
        expect(a).toBe(b);
    });

    it('validators accept properly-shaped values', () => {
        const salt = encodePasswordSalt(generatePasswordSalt());
        expect(isValidPasswordSalt(salt)).toBe(true);
        expect(isValidPasswordIterations(PASSWORD_PBKDF2_ITERATIONS)).toBe(true);
        expect(isValidPasswordIterations(PASSWORD_MIN_ITERATIONS)).toBe(true);
        expect(isValidPasswordIterations(PASSWORD_MAX_ITERATIONS)).toBe(true);
        expect(isValidPasswordParams({ salt, iterations: PASSWORD_PBKDF2_ITERATIONS })).toBe(true);
    });

    it('validators reject malformed values', () => {
        expect(isValidPasswordSalt('too-short')).toBe(false);
        expect(isValidPasswordSalt('a'.repeat(40))).toBe(false);
        expect(isValidPasswordIterations(50_000)).toBe(false);
        expect(isValidPasswordIterations(2_000_000)).toBe(false);
        expect(isValidPasswordIterations(3.14)).toBe(false);
        expect(isValidPasswordParams({ salt: 'too-short', iterations: 100_000 })).toBe(false);
        expect(isValidPasswordParams(null)).toBe(false);
    });

    it('rejects deriving with a wrong-length salt', async () => {
        await expect(derivePasswordKey('pw', new Uint8Array(8), 100_000)).rejects.toThrow();
    });

    it('rejects deriving with out-of-range iterations', async () => {
        await expect(derivePasswordKey('pw', new Uint8Array(PASSWORD_SALT_BYTES), 50_000)).rejects.toThrow();
    });
});
