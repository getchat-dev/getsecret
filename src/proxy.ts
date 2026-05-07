import { type NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { buildCspHeader } from '@/lib/security-headers';

const handleI18nRouting = createMiddleware(routing);

function generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
    response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
    response.headers.set('x-nonce', nonce);
    return response;
}

function logRequest(request: NextRequest): void {
    const ua = request.headers.get('user-agent') ?? '-';
    const uaShort = (ua.length > 80 ? ua.slice(0, 80) : ua).replace(/"/g, "'");
    const xff = request.headers.get('x-forwarded-for');
    const ip = xff ? (xff.split(',')[0]?.trim() ?? '-') : '-';
    console.log(`[req] ${request.method} ${request.nextUrl.pathname} ip=${ip || '-'} ua="${uaShort}"`);
}

export function proxy(request: NextRequest): NextResponse {
    logRequest(request);
    const nonce = generateNonce();
    const { pathname } = request.nextUrl;

    // API and secret-viewer routes are not localized — skip the intl middleware
    // so their URLs don't get a locale prefix, and just attach our security
    // headers. /s/:id picks the UI language from Accept-Language at render time.
    if (pathname.startsWith('/api/') || pathname.startsWith('/s/')) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-nonce', nonce);
        const response = NextResponse.next({ request: { headers: requestHeaders } });
        return applySecurityHeaders(response, nonce);
    }

    const response = handleI18nRouting(request);
    return applySecurityHeaders(response, nonce);
}

export const config = {
    // Match all pathnames except for those that are static assets, API routes
    // are matched explicitly so security headers still apply.
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)', '/api/:path*'],
};
