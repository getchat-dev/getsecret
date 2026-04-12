import { NextResponse } from 'next/server';

export function getClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
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
