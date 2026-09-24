import { defineRouting } from 'next-intl/routing';

// Other languages (de, es, fr, it, zh) are temporarily hidden from the switcher and routing
// while their long-form prose is missing — JSON UI strings and content scaffolding remain in
// the repo, ready to be re-enabled once each locale has authored MDX in src/content/.
//
// Why 'as-needed' and not 'always': under 'always' the bare `/` could only redirect,
// and search engines never index a redirecting URL — Search Console reported the
// home page as "Page with redirect". Now the default locale is served unprefixed
// (`/`, `/faq`) with a 200, other locales keep their prefix (`/ru/faq`).
//
// Detection still runs on every unprefixed URL: a NEXT_LOCALE cookie or a matching
// Accept-Language sends `/faq` to `/ru/faq`. Crawlers send neither, so they get the
// default locale. Old `/en/...` URLs are permanently redirected in next.config.ts;
// absolute URLs for metadata are built by localizedUrl() in lib/site-meta.ts.
export const routing = defineRouting({
    locales: ['en', 'ru'] as const,
    defaultLocale: 'en',
    localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
