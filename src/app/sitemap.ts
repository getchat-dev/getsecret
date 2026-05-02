import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

const STATIC_PATHS = ['', '/docs', '/security', '/developers', '/faq'] as const;

function siteOrigin(): string {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
    return fromEnv || 'http://localhost:3000';
}

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
