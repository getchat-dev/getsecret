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

// TRUSTED_PROXY_HOPS must be set explicitly. A silent default of 0 would make
// every client share the single 'unknown' rate-limit bucket — one attacker
// could exhaust the budget for the entire fleet (trivial DoS). Fail loud at
// first use so a missing or malformed value is caught in deploy/dev, not in
// production traffic.
function getTrustedProxyHops(): number {
    const raw = process.env.TRUSTED_PROXY_HOPS;
    if (raw === undefined || raw.trim() === '') {
        throw new Error(
            'TRUSTED_PROXY_HOPS is not set. Set it to the number of trusted reverse-proxy hops in front of the app ' +
                '(1 behind Traefik/nginx; higher for chained proxies; 0 only for direct exposure, which disables ' +
                'per-IP rate limiting).',
        );
    }

    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`TRUSTED_PROXY_HOPS must be a non-negative integer, got: ${JSON.stringify(raw)}`);
    }

    return parsed;
}

export function getClientIp(request: Request): string {
    const hops = getTrustedProxyHops();
    if (hops === 0) {
        // Operator explicitly opted out of header-based IP detection; nothing
        // we can trust here. Returning a constant means rate-limit becomes
        // global — this is a deliberate trade-off for direct-exposure setups.
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

export type ReadJsonResult<T> = { ok: true; body: T } | { ok: false; error: 'body-too-large' | 'invalid-json' };

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<ReadJsonResult<T>> {
    const contentLength = request.headers.get('content-length');
    if (contentLength !== null) {
        const declaredSize = Number.parseInt(contentLength, 10);
        if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > maxBytes) {
            return { ok: false, error: 'body-too-large' };
        }
    }

    if (!request.body) {
        return { ok: false, error: 'invalid-json' };
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        if (!value) {
            continue;
        }

        received += value.byteLength;
        if (received > maxBytes) {
            await reader.cancel().catch(() => undefined);
            return { ok: false, error: 'body-too-large' };
        }

        chunks.push(value);
    }

    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
    }

    try {
        return { ok: true, body: JSON.parse(new TextDecoder().decode(buffer)) as T };
    } catch {
        return { ok: false, error: 'invalid-json' };
    }
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
