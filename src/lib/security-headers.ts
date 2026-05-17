export const STATIC_SECURITY_HEADERS = [
    {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
    },
    {
        key: 'X-Frame-Options',
        value: 'DENY',
    },
    {
        key: 'Referrer-Policy',
        value: 'no-referrer',
    },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
    },
    {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
    },
] as const;

const IPV4_HOST = /^(\d+\.){3}\d+$/;

// Build the `connect-src` directive: 'self' plus whatever S3-compatible
// storage we have configured. Browsers need to PUT (upload) and GET
// (download) signed URLs directly from the bucket, which means the bucket's
// origin must be on the connect-src allowlist.
//
// We allow both the exact endpoint origin (covers path-style hosts like
// MinIO `http://localhost:9000`) and a one-level wildcard against the parent
// domain (covers virtual-hosted style like `bucket.fra1.digitaloceanspaces.com`,
// where the bucket appears as a subdomain of the endpoint).
function buildConnectSrc(): string {
    const sources: string[] = ["'self'"];
    const endpoint = process.env.S3_ENDPOINT;
    if (endpoint) {
        try {
            const url = new URL(endpoint);
            sources.push(url.origin);
            const host = url.hostname;
            const parts = host.split('.');
            if (host !== 'localhost' && !IPV4_HOST.test(host) && parts.length >= 2) {
                const parentDomain = parts.slice(-2).join('.');
                sources.push(`${url.protocol}//*.${parentDomain}`);
            }
        } catch {
            // Malformed S3_ENDPOINT — silently skip; CSP is still strict.
        }
    }
    // Next.js dev mode opens a same-origin WebSocket for HMR
    // (ws://<host>/_next/webpack-hmr). 'self' covers http(s) only, so ws: has
    // to be allowed explicitly. Production builds don't open this socket.
    if (process.env.NODE_ENV !== 'production') {
        sources.push('ws:', 'wss:');
    }
    return sources.join(' ');
}

function buildScriptSrc(nonce: string): string {
    const base = `'self' 'nonce-${nonce}' 'strict-dynamic'`;
    // React Fast Refresh and webpack HMR use eval() in dev for module
    // reconciliation. Without 'unsafe-eval' the browser blocks both and the
    // dev server can't propagate code changes to the running page.
    if (process.env.NODE_ENV !== 'production') {
        return `${base} 'unsafe-eval'`;
    }
    return base;
}

export function buildCspHeader(nonce: string): string {
    return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        `script-src ${buildScriptSrc(nonce)}`,
        `connect-src ${buildConnectSrc()}`,
    ].join('; ');
}
