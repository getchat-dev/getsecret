import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';

function requestFor(path = '/', headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(new URL(path, 'http://localhost'), { headers });
}

describe('proxy', () => {
    it('sets a Content-Security-Policy containing a nonce on every response', () => {
        const response = proxy(requestFor());
        const csp = response.headers.get('Content-Security-Policy');
        expect(csp).toBeTruthy();
        expect(csp ?? '').toMatch(/nonce-[A-Za-z0-9+/=_-]{10,}/);
    });

    it('generates a different nonce per request', () => {
        const a = proxy(requestFor()).headers.get('Content-Security-Policy') ?? '';
        const b = proxy(requestFor()).headers.get('Content-Security-Policy') ?? '';
        const nonceA = a.match(/nonce-([A-Za-z0-9+/=_-]+)/)?.[1];
        const nonceB = b.match(/nonce-([A-Za-z0-9+/=_-]+)/)?.[1];
        expect(nonceA).toBeTruthy();
        expect(nonceB).toBeTruthy();
        expect(nonceA).not.toBe(nonceB);
    });

    it('forwards the nonce to downstream handlers via x-nonce header', () => {
        const response = proxy(requestFor());
        const nonce = response.headers.get('x-nonce');
        expect(nonce).toBeTruthy();
        expect(response.headers.get('Content-Security-Policy')).toContain(`nonce-${nonce}`);
    });

    // A redirecting `/` is never indexed. Crawlers send no Accept-Language and no
    // cookie, so this is the path Googlebot takes.
    it('serves the root in English without a redirect', () => {
        const response = proxy(requestFor('/'));
        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
        expect(response.headers.get('x-middleware-rewrite')).toMatch(/\/en$/);
    });

    it('sends a Russian-speaking visitor from the root to /ru', () => {
        const response = proxy(requestFor('/', { 'accept-language': 'ru-RU,ru;q=0.9' }));
        expect(response.status).toBe(307);
        expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/ru');
    });

    it('lets a stored English choice override a Russian browser', () => {
        const response = proxy(requestFor('/', { 'accept-language': 'ru', cookie: 'NEXT_LOCALE=en' }));
        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });

    it('serves /ru without a redirect', () => {
        const response = proxy(requestFor('/ru/faq'));
        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });
});
