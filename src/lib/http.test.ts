import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getClientIp } from '@/lib/http';

const originalHops = process.env.TRUSTED_PROXY_HOPS;

function setHops(value: string | undefined) {
    if (value === undefined) {
        delete process.env.TRUSTED_PROXY_HOPS;
    } else {
        process.env.TRUSTED_PROXY_HOPS = value;
    }
}

function requestWith(headers: Record<string, string>) {
    return new Request('http://localhost/', { headers });
}

describe('getClientIp', () => {
    beforeEach(() => {
        setHops(undefined);
    });

    afterEach(() => {
        setHops(originalHops);
    });

    it('returns "unknown" when no proxy is trusted, ignoring x-forwarded-for', () => {
        setHops('0');
        expect(getClientIp(requestWith({ 'x-forwarded-for': '1.2.3.4' }))).toBe('unknown');
        expect(getClientIp(requestWith({ 'x-real-ip': '1.2.3.4' }))).toBe('unknown');
    });

    it('defaults to ignoring headers when TRUSTED_PROXY_HOPS is unset', () => {
        expect(getClientIp(requestWith({ 'x-forwarded-for': '1.2.3.4' }))).toBe('unknown');
    });

    it('takes the rightmost untrusted IP when one proxy hop is trusted', () => {
        setHops('1');
        expect(getClientIp(requestWith({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    });

    it('rejects attacker-prepended spoofed IPs with a single trusted hop', () => {
        setHops('1');
        expect(
            getClientIp(
                requestWith({
                    'x-forwarded-for': '1.2.3.4, 5.6.7.8, 10.0.0.1',
                }),
            ),
        ).toBe('5.6.7.8');
    });

    it('honors multiple trusted hops', () => {
        setHops('2');
        expect(
            getClientIp(
                requestWith({
                    'x-forwarded-for': '3.3.3.3, 10.0.0.1, 10.0.0.2',
                }),
            ),
        ).toBe('3.3.3.3');
    });

    it('falls back to x-real-ip only when hops=1 and x-forwarded-for is missing', () => {
        setHops('1');
        expect(getClientIp(requestWith({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
    });

    it('does not trust x-real-ip when hops=0', () => {
        setHops('0');
        expect(getClientIp(requestWith({ 'x-real-ip': '8.8.8.8' }))).toBe('unknown');
    });

    it('returns "unknown" when x-forwarded-for has fewer entries than trusted hops', () => {
        setHops('3');
        expect(getClientIp(requestWith({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('unknown');
    });

    it('rejects malformed IP values at the resolved position', () => {
        setHops('1');
        expect(getClientIp(requestWith({ 'x-forwarded-for': 'not-an-ip, 10.0.0.1' }))).toBe('unknown');
    });

    it('accepts IPv6 at the resolved position', () => {
        setHops('1');
        expect(getClientIp(requestWith({ 'x-forwarded-for': '2001:db8::1, 10.0.0.1' }))).toBe('2001:db8::1');
    });

    it('treats negative or non-numeric TRUSTED_PROXY_HOPS as zero', () => {
        setHops('-1');
        expect(getClientIp(requestWith({ 'x-forwarded-for': '1.2.3.4' }))).toBe('unknown');
        setHops('nope');
        expect(getClientIp(requestWith({ 'x-forwarded-for': '1.2.3.4' }))).toBe('unknown');
    });
});
