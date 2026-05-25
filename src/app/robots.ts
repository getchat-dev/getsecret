import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-meta';

export default function robots(): MetadataRoute.Robots {
    const origin = siteOrigin();

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/s/*', '/api/*'],
            },
        ],
        sitemap: `${origin}/sitemap.xml`,
        host: origin,
    };
}
