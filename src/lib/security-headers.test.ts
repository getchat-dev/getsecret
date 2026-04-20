import { describe, expect, it } from 'vitest';
import { buildCspHeader, STATIC_SECURITY_HEADERS } from '@/lib/security-headers';

function header(name: string): string | undefined {
    return STATIC_SECURITY_HEADERS.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;
}

describe('security-headers', () => {
    it('exposes HSTS with a long max-age and includeSubDomains', () => {
        const hsts = header('Strict-Transport-Security');
        expect(hsts).toBeDefined();
        expect(hsts).toMatch(/max-age=\d{7,}/);
        expect(hsts).toContain('includeSubDomains');
    });

    it('still ships the non-CSP baseline headers', () => {
        expect(header('X-Content-Type-Options')).toBe('nosniff');
        expect(header('X-Frame-Options')).toBe('DENY');
        expect(header('Referrer-Policy')).toBe('no-referrer');
        expect(header('Permissions-Policy')).toContain('camera=()');
    });

    it('does NOT carry a static Content-Security-Policy (must come from middleware)', () => {
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
