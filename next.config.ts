import { readFileSync } from 'node:fs';
import createMDX from '@next/mdx';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { getStaticSecurityHeaders } from './src/lib/security-headers';

// Версия и лицензия читаются из package.json один раз при загрузке этого
// конфига (build time на проде, старт dev-сервера в dev). Дальше попадают в
// бандл как обычные строки через process.env.NEXT_PUBLIC_* — компонент не
// импортирует package.json и не открывает файл на каждый запрос.
const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string; license?: string };

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
    allowedDevOrigins: ['burnotes.local'],
    env: {
        NEXT_PUBLIC_APP_VERSION: pkg.version,
        NEXT_PUBLIC_APP_LICENSE: pkg.license ?? '',
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: getStaticSecurityHeaders().map((h) => ({ key: h.key, value: h.value })),
            },
        ];
    },
};

export default withNextIntl(withMDX(nextConfig));
