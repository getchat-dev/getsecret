import type { MetadataRoute } from 'next';

function siteOrigin(): string {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
    return fromEnv || 'http://localhost:3000';
}

export default function robots(): MetadataRoute.Robots {
    const origin = siteOrigin();

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/*/s/*', '/api/*'],
            },
        ],
        sitemap: `${origin}/sitemap.xml`,
        host: origin,
    };
}
