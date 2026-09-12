import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { OG_IMAGE_SIZE } from '@/lib/brand';

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

// The file-convention image at [locale]/opengraph-image.tsx only reaches the
// segment it lives in: a page that returns its own `openGraph` object — which is
// every page here — drops the inherited one, and /security shipped a
// `summary_large_image` card with no image. Stating it for every page fixes that
// and keeps one source of truth for the URL.
function ogImage(locale: string, alt: string) {
    return {
        url: `${siteOrigin()}/${locale}/opengraph-image`,
        width: OG_IMAGE_SIZE.width,
        height: OG_IMAGE_SIZE.height,
        alt,
    };
}

// The card shows the brand mark over the tagline, so that is what the alt text
// describes. Composed here rather than at each call site: the shape belongs to
// the card, and a page only has to supply its own language's tagline.
export function socialCardAlt(tagline: string): string {
    return `${SITE_NAME} — ${tagline}`;
}

type BuildArgs = {
    locale: string;
    path: string; // e.g. '/', '/security', '/docs'
    title: string;
    description: string;
    type?: 'website' | 'article';
    // Alt text for the social card, from socialCardAlt(). Optional so a caller
    // without the meta namespace still gets a valid card; the fallback is
    // English, which is wrong on a Russian page — pass it.
    imageAlt?: string;
    // Keeps a page reachable and crawlable while telling search engines not to
    // list it. Used by the pages whose MDX is still a placeholder: a thin page in
    // the index costs the whole domain, an unlisted one costs nothing.
    noindex?: boolean;
};

// Single funnel for every public page's metadata. Centralises OG/Twitter,
// alternates, and the site-name suffix so per-page generateMetadata stays a
// one-liner. The root [locale]/layout.tsx sets `title.template: '%s · …'`,
// so callers pass the bare page title here and Next composes the final one.
export function buildPageMetadata({
    locale,
    path,
    title,
    description,
    type = 'website',
    imageAlt = `${SITE_NAME} — encrypted one-time links`,
    noindex = false,
}: BuildArgs): Metadata {
    const image = ogImage(locale, imageAlt);
    const alternates = localizedAlternates(path, locale);
    return {
        title,
        description,
        alternates,
        ...(noindex ? { robots: { index: false, follow: true } } : {}),
        openGraph: {
            type,
            siteName: SITE_NAME,
            title,
            description,
            url: typeof alternates.canonical === 'string' ? alternates.canonical : undefined,
            locale,
            alternateLocale: routing.locales.filter((l) => l !== locale),
            images: [image],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [image.url],
        },
    };
}
