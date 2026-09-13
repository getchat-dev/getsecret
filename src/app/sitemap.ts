import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { siteOrigin } from '@/lib/site-meta';

// Only pages with authored prose. /docs and /developers are routable but still
// placeholders — they carry `noindex` and stay out of the sitemap until their
// MDX is written, then they come back here in the same commit.
const STATIC_PATHS = ['', '/security', '/threat-model', '/faq'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
    const origin = siteOrigin();
    const lastModified = new Date();

    return STATIC_PATHS.flatMap((path) =>
        routing.locales.map((locale) => ({
            url: `${origin}/${locale}${path}`,
            lastModified,
            alternates: {
                languages: {
                    ...Object.fromEntries(
                        routing.locales.map((altLocale) => [altLocale, `${origin}/${altLocale}${path}`]),
                    ),
                    // Mirrors localizedAlternates() in site-meta.ts, which emits
                    // x-default in the document head. The two have to agree.
                    'x-default': `${origin}/${routing.defaultLocale}${path}`,
                },
            },
        })),
    );
}
