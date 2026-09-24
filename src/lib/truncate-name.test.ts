import { describe, expect, it } from 'vitest';
import { ELLIPSIS, truncateName } from '@/lib/truncate-name';

// One grapheme = one unit of width, so `max` reads as "this many characters".
const fitsChars = (max: number) => (candidate: string) => Array.from(candidate).length <= max;

describe('truncateName', () => {
    it('returns the name untouched when it fits', () => {
        expect(truncateName('secret', fitsChars(6), 'middle')).toBe('secret');
        expect(truncateName('secret', fitsChars(6), 'end')).toBe('secret');
    });

    it('cuts in the middle, favouring the start on odd splits', () => {
        // 9 slots: 8 kept graphemes + the ellipsis.
        expect(truncateName('abcdefghijklmnop', fitsChars(9), 'middle')).toBe(`abcd${ELLIPSIS}mnop`);
        expect(truncateName('abcdefghijklmnop', fitsChars(8), 'middle')).toBe(`abcd${ELLIPSIS}nop`);
    });

    it('cuts at the end', () => {
        expect(truncateName('abcdefghijklmnop', fitsChars(9), 'end')).toBe(`abcdefgh${ELLIPSIS}`);
    });

    it('uses every available slot — no gap left before the tail', () => {
        for (let max = 2; max < 16; max += 1) {
            const out = truncateName('abcdefghijklmnop', fitsChars(max), 'middle');
            expect(Array.from(out)).toHaveLength(max);
        }
    });

    it('falls back to a bare ellipsis when nothing fits', () => {
        expect(truncateName('abcdef', fitsChars(1), 'middle')).toBe(ELLIPSIS);
        expect(truncateName('abcdef', fitsChars(0), 'end')).toBe(ELLIPSIS);
    });

    it('never leaves whitespace touching the ellipsis', () => {
        const name = 'ab cd ef gh ij kl mn';
        for (let max = 1; max < name.length; max += 1) {
            for (const mode of ['middle', 'end'] as const) {
                expect(truncateName(name, fitsChars(max), mode)).not.toMatch(/\s…|…\s/);
            }
        }
        expect(truncateName('abc defghij', fitsChars(5), 'end')).toBe(`abc${ELLIPSIS}`);
    });

    it('never splits an emoji or a combining sequence', () => {
        const out = truncateName('😀😀😀😀😀😀😀😀', fitsChars(5), 'middle');
        expect(out).toBe(`😀😀${ELLIPSIS}😀😀`);
        const decomposed = `e${String.fromCodePoint(0x0301)}`.repeat(10);
        const cut = truncateName(decomposed, (c) => c.length <= 9, 'end');
        expect(cut.normalize('NFC')).toMatch(new RegExp(`^${String.fromCodePoint(0x00e9)}+${ELLIPSIS}$`));
    });
});
