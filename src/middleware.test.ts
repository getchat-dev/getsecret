import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';

function requestFor(path = '/'): NextRequest {
    return new NextRequest(new URL(path, 'http://localhost'));
}

describe('middleware', () => {
    it('sets a Content-Security-Policy containing a nonce on every response', () => {
        const response = middleware(requestFor());
        const csp = response.headers.get('Content-Security-Policy');
        expect(csp).toBeTruthy();
        expect(csp ?? '').toMatch(/nonce-[A-Za-z0-9+/=_-]{10,}/);
    });

    it('generates a different nonce per request', () => {
        const a = middleware(requestFor()).headers.get('Content-Security-Policy') ?? '';
        const b = middleware(requestFor()).headers.get('Content-Security-Policy') ?? '';
        const nonceA = a.match(/nonce-([A-Za-z0-9+/=_-]+)/)?.[1];
        const nonceB = b.match(/nonce-([A-Za-z0-9+/=_-]+)/)?.[1];
        expect(nonceA).toBeTruthy();
        expect(nonceB).toBeTruthy();
        expect(nonceA).not.toBe(nonceB);
    });

    it('forwards the nonce to downstream handlers via x-nonce header', () => {
        const response = middleware(requestFor());
        const nonce = response.headers.get('x-nonce');
        expect(nonce).toBeTruthy();
        expect(response.headers.get('Content-Security-Policy')).toContain(`nonce-${nonce}`);
    });
});
