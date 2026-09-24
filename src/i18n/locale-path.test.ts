import { describe, expect, it } from 'vitest';
import { isLocalizedPath, pathForLocale, stripLocalePrefix } from '@/i18n/locale-path';

describe('stripLocalePrefix', () => {
    it('removes a locale segment and leaves unprefixed paths alone', () => {
        expect(stripLocalePrefix('/ru/faq')).toBe('/faq');
        expect(stripLocalePrefix('/ru')).toBe('/');
        expect(stripLocalePrefix('/faq')).toBe('/faq');
        expect(stripLocalePrefix('/')).toBe('/');
    });

    it('does not treat a word that starts with a locale code as a prefix', () => {
        expect(stripLocalePrefix('/rules')).toBe('/rules');
    });
});

describe('pathForLocale', () => {
    it('drops the prefix for the default locale', () => {
        expect(pathForLocale('/ru/faq', 'en')).toBe('/faq');
        expect(pathForLocale('/ru', 'en')).toBe('/');
    });

    it('adds the prefix for other locales, without a trailing slash on the root', () => {
        expect(pathForLocale('/faq', 'ru')).toBe('/ru/faq');
        expect(pathForLocale('/', 'ru')).toBe('/ru');
    });
});

describe('isLocalizedPath', () => {
    it('excludes the global secret-viewer and API routes', () => {
        expect(isLocalizedPath('/s/abc')).toBe(false);
        expect(isLocalizedPath('/api/secrets')).toBe(false);
        expect(isLocalizedPath('/')).toBe(true);
        expect(isLocalizedPath('/ru/faq')).toBe(true);
    });
});
