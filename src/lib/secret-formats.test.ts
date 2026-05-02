import { describe, expect, it } from 'vitest';
import { DEFAULT_SECRET_FORMAT, isSecretFormat, SECRET_FORMATS } from '@/lib/secret-formats';

describe('secret-formats', () => {
    it('defaults to plain', () => {
        expect(DEFAULT_SECRET_FORMAT).toBe('plain');
        expect(SECRET_FORMATS).toContain('plain');
    });

    it('accepts every format in the allowlist', () => {
        for (const format of SECRET_FORMATS) {
            expect(isSecretFormat(format)).toBe(true);
        }
    });

    it('rejects unknown formats', () => {
        expect(isSecretFormat('cobol')).toBe(false);
        expect(isSecretFormat('JSON')).toBe(false);
        expect(isSecretFormat('')).toBe(false);
        expect(isSecretFormat(undefined)).toBe(false);
        expect(isSecretFormat(null)).toBe(false);
        expect(isSecretFormat(123)).toBe(false);
        expect(isSecretFormat({})).toBe(false);
    });
});
