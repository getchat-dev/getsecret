import createMDX from '@next/mdx';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const withMDX = createMDX({
    options: {
        // Turbopack requires serializable plugin references — string names, not function imports.
        // remark-frontmatter takes a preset string ('yaml' here) rather than an options object.
        remarkPlugins: [
            ['remark-frontmatter', 'yaml'],
            ['remark-mdx-frontmatter', {}],
            ['remark-gfm', {}],
        ],
    },
});

const nextConfig: NextConfig = {
    output: 'standalone',
    poweredByHeader: false,
    serverExternalPackages: ['ioredis'],
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: STATIC_SECURITY_HEADERS.map((h) => ({ key: h.key, value: h.value })),
            },
        ];
    },
};

export default withNextIntl(withMDX(nextConfig));
