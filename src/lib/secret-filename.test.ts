import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SECRET_FILENAME,
    getDefaultSecretFilename,
    MAX_FILENAME_BYTES,
    sanitizeFilename,
} from '@/lib/secret-filename';

// Built from code points so no invisible character sits in this source file
// (and a formatter can't turn an escape into the raw character).
const cp = (code: number) => String.fromCodePoint(code);
const NUL = cp(0x0000);
const DEL = cp(0x007f);
const NBSP = cp(0x00a0);
const COMBINING_ACUTE = cp(0x0301);
const E_ACUTE = cp(0x00e9);
const ZWSP = cp(0x200b);
const RLM = cp(0x200f);
const LS = cp(0x2028);
const PS = cp(0x2029);
const RLO = cp(0x202e);
const LRI = cp(0x2066);
const PDI = cp(0x2069);
const BOM = cp(0xfeff);
const ZWJ = cp(0x200d);
const HIGH_SURROGATE = String.fromCharCode(0xd83d);
const LOW_SURROGATE = String.fromCharCode(0xde00);

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

// A high surrogate not followed by a low one, or a low one not preceded by a
// high one — i.e. a code point split in half.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// Properties every sanitized name must hold, however it was truncated.
function expectSafe(out: string) {
    expect(utf8Bytes(out)).toBeLessThanOrEqual(MAX_FILENAME_BYTES);
    expect(out).not.toMatch(LONE_SURROGATE);
    expect(out).not.toMatch(/^[\s.]|[\s.]$/);
    expect(sanitizeFilename(out)).toBe(out);
}

describe('getDefaultSecretFilename', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('falls back to the built-in default when unset', () => {
        vi.stubEnv('DEFAULT_SECRET_FILENAME', undefined);
        expect(getDefaultSecretFilename()).toBe(DEFAULT_SECRET_FILENAME);
    });

    it('uses the env override', () => {
        vi.stubEnv('DEFAULT_SECRET_FILENAME', 'credentials');
        expect(getDefaultSecretFilename()).toBe('credentials');
    });

    it('sanitizes the env override', () => {
        vi.stubEnv('DEFAULT_SECRET_FILENAME', ' ../creds ');
        expect(getDefaultSecretFilename()).toBe('creds');
    });

    it('falls back when the override sanitizes to nothing', () => {
        vi.stubEnv('DEFAULT_SECRET_FILENAME', ' ./ ');
        expect(getDefaultSecretFilename()).toBe(DEFAULT_SECRET_FILENAME);
    });
});

describe('sanitizeFilename', () => {
    it('keeps ordinary names, including unicode and inner dots', () => {
        expect(sanitizeFilename('prod.env backup')).toBe('prod.env backup');
        expect(sanitizeFilename('пароли')).toBe('пароли');
        expect(sanitizeFilename('报告.pdf')).toBe('报告.pdf');
    });

    it('strips path separators, Windows-reserved chars and edge dots', () => {
        expect(sanitizeFilename(' ..a/b\\c:d*?"<>|. ')).toBe('abcd');
        expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd');
    });

    it('returns empty when nothing usable is left', () => {
        expect(sanitizeFilename(' ./.. ')).toBe('');
        expect(sanitizeFilename(RLO + ZWSP)).toBe('');
    });

    it('strips bidi overrides so the extension cannot be spoofed', () => {
        // Renders as "invoiceexe.pdf" if U+202E survives.
        expect(sanitizeFilename(`invoice${RLO}fdp.exe`)).toBe('invoicefdp.exe');
        expect(sanitizeFilename(`a${LRI}b${PDI}c${RLM}d`)).toBe('abcd');
    });

    it('strips control chars and zero-width chars', () => {
        expect(sanitizeFilename(`a${NUL}b\nc\td${DEL}e${ZWSP}f${BOM}g`)).toBe('abcdefg');
        expect(sanitizeFilename(`a${LS}b${PS}c`)).toBe('abc');
    });

    it('collapses whitespace runs', () => {
        expect(sanitizeFilename(`a ${NBSP}  b`)).toBe('a b');
    });

    it('normalizes to NFC', () => {
        expect(sanitizeFilename(`e${COMBINING_ACUTE}`)).toBe(E_ACUTE);
    });

    it('prefixes Windows device names', () => {
        expect(sanitizeFilename('CON')).toBe('_CON');
        expect(sanitizeFilename('nul.txt')).toBe('_nul.txt');
        expect(sanitizeFilename('com1')).toBe('_com1');
        expect(sanitizeFilename('console')).toBe('console');
    });
});

describe('sanitizeFilename length limits', () => {
    it('leaves a name at exactly the byte limit untouched', () => {
        const name = 'x'.repeat(MAX_FILENAME_BYTES);
        expect(sanitizeFilename(name)).toBe(name);
    });

    it('cuts a name one byte over the limit', () => {
        expect(sanitizeFilename('x'.repeat(MAX_FILENAME_BYTES + 1))).toBe('x'.repeat(MAX_FILENAME_BYTES));
    });

    it('cuts 2-byte Cyrillic on a character boundary', () => {
        const out = sanitizeFilename('я'.repeat(1_000));
        expect(out).toBe('я'.repeat(MAX_FILENAME_BYTES / 2));
        expectSafe(out);
    });

    it('cuts 3-byte CJK below the limit rather than mid-character', () => {
        const out = sanitizeFilename('报'.repeat(1_000));
        expect(out).toBe('报'.repeat(Math.floor(MAX_FILENAME_BYTES / 3)));
        expectSafe(out);
    });

    it('never splits a 4-byte emoji surrogate pair', () => {
        const out = sanitizeFilename('😀'.repeat(1_000));
        expect(out).toBe('😀'.repeat(MAX_FILENAME_BYTES / 4));
        expectSafe(out);
    });

    it('drops a whole emoji that straddles the limit', () => {
        // 198 + 4 = 202 bytes: the emoji would cross the line, so it goes.
        const out = sanitizeFilename(`${'a'.repeat(MAX_FILENAME_BYTES - 2)}😀`);
        expect(out).toBe('a'.repeat(MAX_FILENAME_BYTES - 2));
        expectSafe(out);
    });

    it('strips lone surrogates instead of passing malformed UTF-16 on', () => {
        expect(sanitizeFilename(`a${HIGH_SURROGATE}b${LOW_SURROGATE}c`)).toBe('abc');
    });

    it('splits ZWJ emoji sequences into plain emoji rather than leaving a dangling joiner', () => {
        const family = `👨${ZWJ}👩${ZWJ}👧`;
        const out = sanitizeFilename(family.repeat(100));
        expect(out).not.toContain(ZWJ);
        expectSafe(out);
    });

    it('does not leave a trailing dot or space at the cut', () => {
        // Cut lands right after the dot/space; a trailing dot is silently
        // dropped by Windows and would change the name on disk.
        expectSafe(sanitizeFilename(`${'a'.repeat(MAX_FILENAME_BYTES - 1)}.${'b'.repeat(50)}`));
        expectSafe(sanitizeFilename(`${'a'.repeat(MAX_FILENAME_BYTES - 1)} ${'b'.repeat(50)}`));
    });

    it('keeps a short extension and cuts the stem instead', () => {
        const out = sanitizeFilename(`${'я'.repeat(1_000)}.pdf`);
        expect(out.endsWith('.pdf')).toBe(true);
        expect(out.slice(0, -4)).toMatch(/^я+$/);
        expectSafe(out);
    });

    it('does not produce a double dot before a kept extension', () => {
        const out = sanitizeFilename(`${'a'.repeat(MAX_FILENAME_BYTES - 5)}.${'b'.repeat(50)}.pdf`);
        expect(out).toBe(`${'a'.repeat(MAX_FILENAME_BYTES - 5)}.pdf`);
        expectSafe(out);
    });

    it('treats an over-long suffix as part of the name, not an extension', () => {
        const out = sanitizeFilename(`${'a'.repeat(300)}.${'b'.repeat(50)}`);
        expect(out).toBe('a'.repeat(MAX_FILENAME_BYTES));
        expectSafe(out);
    });

    it('stays safe when the reserved-name prefix pushes it over the limit', () => {
        expectSafe(sanitizeFilename(`con.${'x'.repeat(MAX_FILENAME_BYTES)}`));
    });

    it('cuts after removing forbidden chars, not before', () => {
        // 1000 RLOs are 3000 bytes of nothing; they must not eat the budget.
        const out = sanitizeFilename(`${RLO.repeat(1_000)}${'x'.repeat(10)}`);
        expect(out).toBe('x'.repeat(10));
    });

    it('handles a megabyte-long name in linear time', () => {
        const started = performance.now();
        const out = sanitizeFilename('я'.repeat(1_000_000));
        expect(performance.now() - started).toBeLessThan(500);
        expectSafe(out);
    });

    it('does not backtrack on a long run of dots before a letter', () => {
        const started = performance.now();
        const out = sanitizeFilename(`a${'.'.repeat(200_000)}a`);
        expect(performance.now() - started).toBeLessThan(500);
        expectSafe(out);
    });
});
