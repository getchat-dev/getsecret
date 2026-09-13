import type { FaqEntry } from '@/lib/faq-schema.generated';
import { SITE_NAME, siteOrigin } from '@/lib/site-meta';

// Schema.org payloads. Kept as plain builders (not components) so the shapes stay
// unit-testable and every page composes its own graph.
//
// Deliberately absent: aggregateRating, review, and anything else asserting
// popularity we cannot evidence. Google issues manual actions for invented
// ratings, and on a security product a fabricated trust signal is worse than none.

type Json = Record<string, unknown>;

function organizationNode(): Json {
    const origin = siteOrigin();
    return {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE_NAME,
        url: origin,
        logo: `${origin}/icon`,
    };
}

type HomeArgs = { locale: string; name: string; description: string };

// Home page graph: who publishes the site, what the site is, and what the app
// does. One @graph rather than three sibling <script> blocks — the @id references
// let a consumer resolve the publisher without re-stating it.
export function homePageLd({ locale, name, description }: HomeArgs): Json {
    const origin = siteOrigin();
    const url = `${origin}/${locale}`;
    return {
        '@context': 'https://schema.org',
        '@graph': [
            organizationNode(),
            {
                '@type': 'WebSite',
                '@id': `${origin}/#website`,
                url: origin,
                name: SITE_NAME,
                inLanguage: locale,
                publisher: { '@id': `${origin}/#organization` },
            },
            {
                '@type': 'WebApplication',
                '@id': `${origin}/#app`,
                name,
                url,
                description,
                inLanguage: locale,
                applicationCategory: 'SecurityApplication',
                // The app is the page: no install step, no platform requirement
                // beyond a browser with Web Crypto.
                operatingSystem: 'Any',
                browserRequirements: 'Requires a browser with the Web Crypto API',
                isAccessibleForFree: true,
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                publisher: { '@id': `${origin}/#organization` },
            },
        ],
    };
}

type ArticleArgs = { locale: string; path: string; title: string; description: string };

// Long-form pages (security, threat model). TechArticle rather than Article: both
// are documentation of how a system works, which is what the type is for.
export function techArticleLd({ locale, path, title, description }: ArticleArgs): Json {
    const origin = siteOrigin();
    const url = `${origin}/${locale}${path}`;
    return {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: title,
        description,
        url,
        inLanguage: locale,
        isPartOf: { '@id': `${origin}/#website` },
        publisher: { '@id': `${origin}/#organization` },
    };
}

type FaqArgs = { locale: string; entries: readonly FaqEntry[] };

// FAQPage. The pairs come from faq-schema.generated.ts so the markup and the
// visible page cannot say different things — both are derived from one MDX file.
export function faqPageLd({ locale, entries }: FaqArgs): Json {
    const origin = siteOrigin();
    const url = `${origin}/${locale}/faq`;
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        url,
        inLanguage: locale,
        isPartOf: { '@id': `${origin}/#website` },
        publisher: { '@id': `${origin}/#organization` },
        mainEntity: entries.map((entry) => ({
            '@type': 'Question',
            name: entry.question,
            acceptedAnswer: { '@type': 'Answer', text: entry.answer },
        })),
    };
}
