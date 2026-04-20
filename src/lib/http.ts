import { NextResponse } from 'next/server';

const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

function isValidIp(value: string): boolean {
    if (IPV4_PATTERN.test(value)) {
        return true;
    }

    if (!IPV6_PATTERN.test(value) || !value.includes(':')) {
        return false;
    }

    return value.split(':').length >= 3;
}

function getTrustedProxyHops(): number {
    const raw = process.env.TRUSTED_PROXY_HOPS;
    if (!raw) {
        return 0;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }

    return parsed;
}

export function getClientIp(request: Request): string {
    const hops = getTrustedProxyHops();
    if (hops <= 0) {
        return 'unknown';
    }

    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        const chain = forwarded
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);

        const targetIndex = chain.length - hops - 1;
        if (targetIndex >= 0) {
            const candidate = chain[targetIndex];
            if (candidate && isValidIp(candidate)) {
                return candidate;
            }
        }

        return 'unknown';
    }

    if (hops === 1) {
        const realIp = request.headers.get('x-real-ip')?.trim();
        if (realIp && isValidIp(realIp)) {
            return realIp;
        }
    }

    return 'unknown';
}

export function jsonNoStore<T>(body: T, status = 200): NextResponse<T> {
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
        },
    });
}
