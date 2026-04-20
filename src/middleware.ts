import { type NextRequest, NextResponse } from 'next/server';
import { buildCspHeader } from '@/lib/security-headers';

function generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

export function middleware(_request: NextRequest): NextResponse {
    const nonce = generateNonce();
    const response = NextResponse.next({
        request: {
            headers: new Headers({ 'x-nonce': nonce }),
        },
    });

    response.headers.set('Content-Security-Policy', buildCspHeader(nonce));
    response.headers.set('x-nonce', nonce);
    return response;
}

export const config = {
    matcher: [
        {
            source: '/((?!_next/static|_next/image|favicon.ico).*)',
        },
    ],
};
