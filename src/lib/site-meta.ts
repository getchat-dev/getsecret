import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

export const SITE_NAME = 'Burnotes';

// Public origin of the deployed site. `sitemap.ts` and `robots.ts` already use
// the same env contract, so this single source of truth keeps the three in
// sync. Falls back to localhost for `next dev` and `next build` without env —
// metadata still renders, just with non-prod-correct absolute URLs.
export function siteOrigin(): string {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
    return fromEnv || 'http://localhost:3000';
}

function joinPath(locale: string, path: string): string {
    // path '/' or '' both mean the locale root; avoid trailing '/' for
    // canonical-URL stability (search engines treat /en/ and /en as distinct).
    const tail = !path || path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
    return `${siteOrigin()}/${locale}${tail}`;
}

// Builds the alternates block: canonical URL for THIS locale + a `languages`
// map covering every locale (hreflang) + `x-default` pointing at the project's
// default locale. Next's Metadata API takes care of emitting the right
// <link rel="alternate" hreflang="..."> tags.
export function localizedAlternates(path: string, locale: string): NonNullable<Metadata['alternates']> {
    const languages: Record<string, string> = Object.fromEntries(routing.locales.map((l) => [l, joinPath(l, path)]));
    languages['x-default'] = joinPath(routing.defaultLocale, path);
    return {
        canonical: joinPath(locale, path),
        languages,
    };
}

type BuildArgs = {
    locale: string;
    path: string; // e.g. '/', '/security', '/docs'
    title: string;
    description: string;
    type?: 'website' | 'article';
};

// Single funnel for every public page's metadata. Centralises OG/Twitter,
// alternates, and the site-name suffix so per-page generateMetadata stays a
// one-liner. The root [locale]/layout.tsx sets `title.template: '%s · …'`,
// so callers pass the bare page title here and Next composes the final one.
export function buildPageMetadata({ locale, path, title, description, type = 'website' }: BuildArgs): Metadata {
    const alternates = localizedAlternates(path, locale);
    return {
        title,
        description,
        alternates,
        openGraph: {
            type,
            siteName: SITE_NAME,
            title,
            description,
            url: typeof alternates.canonical === 'string' ? alternates.canonical : undefined,
            locale,
            alternateLocale: routing.locales.filter((l) => l !== locale),
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        },
    };
}
