import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
        // Local plugin. The reference has to be a serializable string like the
        // remark ones above, and a relative specifier resolves against the
        // resolver rather than the project — hence the absolute path.
        rehypePlugins: [[join(process.cwd(), 'mdx/rehype-faq-details.mjs'), {}]],
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
    // English lived under /en until routing moved to localePrefix 'as-needed'
    // (see src/i18n/routing.ts). next-intl's middleware would bounce those URLs
    // with a temporary 307; a permanent redirect tells search engines to move the
    // indexing and link weight to the unprefixed URL.
    //
    // These run before the middleware, so it never sees /en/... and never updates
    // the NEXT_LOCALE cookie on this hop. That is safe: switching to English via
    // next-intl's router.replace(…, { locale }) navigates to a forced /en/... path
    // but writes the cookie on the client first, and the soft switch on the home
    // page writes it itself (writeLocaleCookie in src/i18n/locale-path.ts).
    async redirects() {
        return [
            { source: '/en', destination: '/', permanent: true },
            { source: '/en/:path*', destination: '/:path*', permanent: true },
        ];
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
