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

// Build the `connect-src` directive: 'self' plus the specific S3 origins
// we actually need to talk to. The browser does presigned PUT/GET against
// the bucket, so the bucket's origin has to be allowlisted — but ONLY the
// exact origin(s), never a wildcard that would also cover sibling buckets
// belonging to other customers of the same provider.
//
// Two URL shapes show up across providers:
//   - virtual-hosted style: `https://<bucket>.<endpoint-host>/<key>`
//     (AWS, DO Spaces, Selectel, R2 by default)
//   - path-style: `<endpoint-origin>/<bucket>/<key>`
//     (MinIO, some local dev S3 servers; opt in via S3_FORCE_PATH_STYLE=true)
//
// We allowlist the endpoint origin in both cases, plus the bucket subdomain
// when virtual-hosted. No wildcards — that previously let `*.srvstorage.kz`
// (or `*.digitaloceanspaces.com`) match any tenant's bucket on the same
// provider, an exfiltration channel if XSS ever lands.
function buildConnectSrc(): string {
    const sources: string[] = ["'self'"];
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const pathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
    if (endpoint) {
        try {
            const url = new URL(endpoint);
            sources.push(url.origin);
            if (!pathStyle && bucket && bucket.length > 0) {
                sources.push(`${url.protocol}//${bucket}.${url.hostname}`);
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
