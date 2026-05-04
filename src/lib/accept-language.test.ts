import { describe, expect, it } from 'vitest';
import { pickLocaleFromAcceptLanguage } from './accept-language';

describe('pickLocaleFromAcceptLanguage', () => {
    it('returns the supported locale when the browser asks for it directly', () => {
        expect(pickLocaleFromAcceptLanguage('ru')).toBe('ru');
        expect(pickLocaleFromAcceptLanguage('en')).toBe('en');
    });

    it('strips region tags before matching', () => {
        expect(pickLocaleFromAcceptLanguage('ru-RU,en;q=0.7')).toBe('ru');
        expect(pickLocaleFromAcceptLanguage('en-US')).toBe('en');
    });

    it('falls back to English when none of the requested languages are supported', () => {
        expect(pickLocaleFromAcceptLanguage('ja')).toBe('en');
        expect(pickLocaleFromAcceptLanguage('pl-PL')).toBe('en');
        expect(pickLocaleFromAcceptLanguage('de,fr;q=0.8,zh;q=0.5')).toBe('en');
    });

    it('falls back to English on a missing or empty header', () => {
        expect(pickLocaleFromAcceptLanguage(null)).toBe('en');
        expect(pickLocaleFromAcceptLanguage(undefined)).toBe('en');
        expect(pickLocaleFromAcceptLanguage('')).toBe('en');
    });

    it('honours quality ordering when the first preference is unsupported', () => {
        // Browser prefers Polish, then Russian. Polish is unsupported, Russian wins.
        expect(pickLocaleFromAcceptLanguage('pl,ru;q=0.9,en;q=0.8')).toBe('ru');
    });
});
