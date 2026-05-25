import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { buildPageMetadata, localizedAlternates, SITE_NAME, siteOrigin } from '@/lib/site-meta';

const original = process.env.NEXT_PUBLIC_SITE_URL;

function setSiteUrl(value: string | undefined) {
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) delete env.NEXT_PUBLIC_SITE_URL;
    else env.NEXT_PUBLIC_SITE_URL = value;
}

describe('siteOrigin', () => {
    afterEach(() => setSiteUrl(original));

    it('falls back to localhost when NEXT_PUBLIC_SITE_URL is unset', () => {
        setSiteUrl(undefined);
        expect(siteOrigin()).toBe('http://localhost:3000');
    });

    it('strips a single trailing slash from the env-provided URL', () => {
        setSiteUrl('https://burnotes.app/');
        expect(siteOrigin()).toBe('https://burnotes.app');
    });
});

describe('localizedAlternates', () => {
    beforeEach(() => setSiteUrl('https://burnotes.app'));
    afterEach(() => setSiteUrl(original));

    it('produces canonical for the current locale and hreflang for every other', () => {
        const result = localizedAlternates('/security', 'en');
        expect(result.canonical).toBe('https://burnotes.app/en/security');
        for (const locale of routing.locales) {
            expect(result.languages?.[locale]).toBe(`https://burnotes.app/${locale}/security`);
        }
    });

    it("includes x-default pointing at the project's default locale", () => {
        const result = localizedAlternates('/docs', 'ru');
        expect(result.languages?.['x-default']).toBe(`https://burnotes.app/${routing.defaultLocale}/docs`);
    });

    it("treats '/' and '' as the locale root (no trailing slash)", () => {
        expect(localizedAlternates('/', 'en').canonical).toBe('https://burnotes.app/en');
        expect(localizedAlternates('', 'en').canonical).toBe('https://burnotes.app/en');
    });

    it('normalizes paths that come in without a leading slash', () => {
        // Defensive — callers shouldn't pass this shape, but a typo shouldn't
        // produce a double-slash URL.
        expect(localizedAlternates('docs', 'en').canonical).toBe('https://burnotes.app/en/docs');
    });
});

describe('buildPageMetadata', () => {
    beforeEach(() => setSiteUrl('https://burnotes.app'));
    afterEach(() => setSiteUrl(original));

    it('embeds title and description across SEO/OG/Twitter blocks', () => {
        const meta = buildPageMetadata({
            locale: 'en',
            path: '/',
            title: 'Share secrets that vanish',
            description: 'One-time encrypted links.',
        });
        expect(meta.title).toBe('Share secrets that vanish');
        expect(meta.description).toBe('One-time encrypted links.');
        expect(meta.openGraph?.title).toBe('Share secrets that vanish');
        expect(meta.openGraph?.description).toBe('One-time encrypted links.');
        expect(meta.twitter?.title).toBe('Share secrets that vanish');
        expect(meta.twitter?.description).toBe('One-time encrypted links.');
    });

    it('sets the OG siteName and a Twitter summary_large_image card', () => {
        const meta = buildPageMetadata({ locale: 'en', path: '/', title: 'T', description: 'D' });
        expect(meta.openGraph?.siteName).toBe(SITE_NAME);
        expect(meta.twitter?.card).toBe('summary_large_image');
    });

    it('populates OG locale + alternateLocale from the routing config', () => {
        const meta = buildPageMetadata({ locale: 'ru', path: '/security', title: 'T', description: 'D' });
        expect(meta.openGraph?.locale).toBe('ru');
        const alts = meta.openGraph?.alternateLocale as string[];
        expect(alts).toEqual(routing.locales.filter((l) => l !== 'ru'));
    });

    it('mirrors the canonical URL into openGraph.url', () => {
        const meta = buildPageMetadata({ locale: 'fr', path: '/faq', title: 'T', description: 'D' });
        expect(meta.openGraph?.url).toBe('https://burnotes.app/fr/faq');
    });
});
