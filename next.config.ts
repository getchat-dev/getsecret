import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

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

export default nextConfig;
