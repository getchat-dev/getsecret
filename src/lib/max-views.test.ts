import { describe, expect, it } from 'vitest';
import { isValidMaxViews, MAX_VIEW_PRESETS, MAX_VIEWS_HARD_CAP } from '@/lib/max-views';

describe('max-views', () => {
    it('accepts each preset', () => {
        for (const preset of MAX_VIEW_PRESETS) {
            expect(isValidMaxViews(preset)).toBe(true);
        }
    });

    it('accepts null as the unlimited sentinel', () => {
        expect(isValidMaxViews(null)).toBe(true);
    });

    it('accepts arbitrary integers within the hard cap', () => {
        expect(isValidMaxViews(2)).toBe(true);
        expect(isValidMaxViews(MAX_VIEWS_HARD_CAP)).toBe(true);
    });

    it('rejects integers above the hard cap', () => {
        expect(isValidMaxViews(MAX_VIEWS_HARD_CAP + 1)).toBe(false);
        expect(isValidMaxViews(1_000_000)).toBe(false);
    });

    it('rejects zero, negatives, and non-integers', () => {
        expect(isValidMaxViews(0)).toBe(false);
        expect(isValidMaxViews(-1)).toBe(false);
        expect(isValidMaxViews(2.5)).toBe(false);
    });

    it('rejects non-numeric types other than null', () => {
        expect(isValidMaxViews('1')).toBe(false);
        expect(isValidMaxViews(undefined)).toBe(false);
        expect(isValidMaxViews({})).toBe(false);
        expect(isValidMaxViews(true)).toBe(false);
    });
});
