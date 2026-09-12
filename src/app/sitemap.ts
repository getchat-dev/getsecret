import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { siteOrigin } from '@/lib/site-meta';

const STATIC_PATHS = ['', '/docs', '/security', '/threat-model', '/developers', '/faq'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
    const origin = siteOrigin();
    const lastModified = new Date();

    return STATIC_PATHS.flatMap((path) =>
        routing.locales.map((locale) => ({
            url: `${origin}/${locale}${path}`,
            lastModified,
            alternates: {
                languages: Object.fromEntries(
                    routing.locales.map((altLocale) => [altLocale, `${origin}/${altLocale}${path}`]),
                ),
            },
        })),
    );
}
