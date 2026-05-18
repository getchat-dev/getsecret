import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCspHeader, getStaticSecurityHeaders } from '@/lib/security-headers';

function connectSrc(csp: string): string {
    return (csp.split(';').find((d) => d.trim().startsWith('connect-src')) ?? '').trim();
}

const originalEndpoint = process.env.S3_ENDPOINT;
const originalBucket = process.env.S3_BUCKET;
const originalPathStyle = process.env.S3_FORCE_PATH_STYLE;
const originalNodeEnv = process.env.NODE_ENV;

function setEnv(name: 'S3_ENDPOINT' | 'S3_BUCKET' | 'S3_FORCE_PATH_STYLE' | 'NODE_ENV', value: string | undefined) {
    // `NODE_ENV` is typed `readonly` on Node's TS lib because it's expected
    // to be set at boot. Tests legitimately need to flip it; widen to the
    // raw record type to bypass the lib-level constraint.
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) {
        delete env[name];
    } else {
        env[name] = value;
    }
}

function header(name: string): string | undefined {
    return getStaticSecurityHeaders().find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;
}

describe('security-headers', () => {
    beforeEach(() => {
        setEnv('NODE_ENV', 'production');
    });

    afterEach(() => {
        setEnv('NODE_ENV', originalNodeEnv);
    });

    it('exposes HSTS with a long max-age and includeSubDomains in production', () => {
        const hsts = header('Strict-Transport-Security');
        expect(hsts).toBeDefined();
        expect(hsts).toMatch(/max-age=\d{7,}/);
        expect(hsts).toContain('includeSubDomains');
    });

    it('omits HSTS in development to keep http://*.local dev hosts working', () => {
        setEnv('NODE_ENV', 'development');
        expect(header('Strict-Transport-Security')).toBeUndefined();
    });

    it('omits HSTS in test runs', () => {
        setEnv('NODE_ENV', 'test');
        expect(header('Strict-Transport-Security')).toBeUndefined();
    });

    it('still ships the non-CSP baseline headers in production', () => {
        expect(header('X-Content-Type-Options')).toBe('nosniff');
        expect(header('X-Frame-Options')).toBe('DENY');
        expect(header('Referrer-Policy')).toBe('no-referrer');
        expect(header('Permissions-Policy')).toContain('camera=()');
    });

    it('keeps baseline non-HSTS headers in development too', () => {
        setEnv('NODE_ENV', 'development');
        expect(header('X-Content-Type-Options')).toBe('nosniff');
        expect(header('X-Frame-Options')).toBe('DENY');
        expect(header('Referrer-Policy')).toBe('no-referrer');
        expect(header('Permissions-Policy')).toContain('camera=()');
    });

    it('does NOT carry a static Content-Security-Policy (must come from proxy)', () => {
        expect(header('Content-Security-Policy')).toBeUndefined();
    });

    it('buildCspHeader embeds the nonce in script-src and drops unsafe-inline there', () => {
        const csp = buildCspHeader('abc123');
        expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
        // the script-src directive itself must not contain 'unsafe-inline'
        const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
        expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it('buildCspHeader keeps the other directives intact', () => {
        const csp = buildCspHeader('nonce');
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("base-uri 'self'");
    });
});

describe('buildCspHeader connect-src', () => {
    beforeEach(() => {
        setEnv('S3_ENDPOINT', undefined);
        setEnv('S3_BUCKET', undefined);
        setEnv('S3_FORCE_PATH_STYLE', undefined);
        setEnv('NODE_ENV', 'production');
    });

    afterEach(() => {
        setEnv('S3_ENDPOINT', originalEndpoint);
        setEnv('S3_BUCKET', originalBucket);
        setEnv('S3_FORCE_PATH_STYLE', originalPathStyle);
        setEnv('NODE_ENV', originalNodeEnv);
    });

    it("contains only 'self' when no S3 is configured", () => {
        const directive = connectSrc(buildCspHeader('nonce'));
        expect(directive).toBe("connect-src 'self'");
    });

    it('virtual-hosted style: allowlists the endpoint origin + bucket subdomain only', () => {
        setEnv('S3_ENDPOINT', 'https://s3.kz-1.srvstorage.kz');
        setEnv('S3_BUCKET', 'burnotes-files');
        const directive = connectSrc(buildCspHeader('nonce'));
        expect(directive).toContain('https://s3.kz-1.srvstorage.kz');
        expect(directive).toContain('https://burnotes-files.s3.kz-1.srvstorage.kz');
    });

    it('never emits a wildcard sibling-domain source (regression guard)', () => {
        setEnv('S3_ENDPOINT', 'https://s3.kz-1.srvstorage.kz');
        setEnv('S3_BUCKET', 'burnotes-files');
        const directive = connectSrc(buildCspHeader('nonce'));
        // Previously emitted `https://*.srvstorage.kz`, which would have matched
        // every Selectel customer's bucket. Make sure no `*.` token ever ships.
        expect(directive).not.toMatch(/\*\./);
        expect(directive).not.toContain('*.srvstorage.kz');
        expect(directive).not.toContain('*.digitaloceanspaces.com');
    });

    it('path-style (MinIO): allowlists only the endpoint origin, no bucket subdomain', () => {
        setEnv('S3_ENDPOINT', 'http://localhost:9000');
        setEnv('S3_BUCKET', 'burnotes-files');
        setEnv('S3_FORCE_PATH_STYLE', 'true');
        const directive = connectSrc(buildCspHeader('nonce'));
        expect(directive).toContain('http://localhost:9000');
        expect(directive).not.toContain('burnotes-files.localhost');
    });

    it('omits bucket subdomain when S3_BUCKET is not configured', () => {
        setEnv('S3_ENDPOINT', 'https://fra1.digitaloceanspaces.com');
        const directive = connectSrc(buildCspHeader('nonce'));
        expect(directive).toContain('https://fra1.digitaloceanspaces.com');
        expect(directive).not.toMatch(/\.digitaloceanspaces\.com[^a-z]/);
    });

    it('silently skips a malformed S3_ENDPOINT', () => {
        setEnv('S3_ENDPOINT', 'not a url');
        setEnv('S3_BUCKET', 'burnotes-files');
        const directive = connectSrc(buildCspHeader('nonce'));
        expect(directive).toBe("connect-src 'self'");
    });

    it('adds ws:/wss: in development for HMR but not in production', () => {
        setEnv('NODE_ENV', 'development');
        expect(connectSrc(buildCspHeader('nonce'))).toMatch(/\bws:\s|wss:/);
        setEnv('NODE_ENV', 'production');
        expect(connectSrc(buildCspHeader('nonce'))).not.toMatch(/\bws:\s|wss:/);
    });
});
