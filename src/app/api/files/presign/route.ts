import { randomBytes, randomUUID } from 'node:crypto';
import { getClientIp, jsonNoStore, readJsonBody } from '@/lib/http';
import { rateLimiter } from '@/lib/rate-limit';
import { getMaxFileSizeBytes, getPresignedPutUrl } from '@/lib/s3-client';
import { getValkey } from '@/lib/valkey-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRESIGN_LIMIT = 10;
const PRESIGN_WINDOW_MS = 60_000;
const PRESIGN_MAX_BODY_BYTES = 512;
const PRESIGN_URL_TTL_SECONDS = 600;
const UPLOAD_SESSION_TTL_MS = 10 * 60 * 1000;
const UPLOAD_TOKEN_PREFIX = 'upload:';

type PresignBody = {
    size?: unknown;
};

export async function POST(request: Request) {
    const clientIp = getClientIp(request);
    if (await rateLimiter.isLimited(`presign:${clientIp}`, PRESIGN_LIMIT, PRESIGN_WINDOW_MS)) {
        return jsonNoStore({ error: 'Too many requests' }, 429);
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
        return jsonNoStore({ error: 'Invalid content type' }, 415);
    }

    const parsed = await readJsonBody<PresignBody>(request, PRESIGN_MAX_BODY_BYTES);
    if (!parsed.ok) {
        if (parsed.error === 'body-too-large') {
            return jsonNoStore({ error: 'Payload too large' }, 413);
        }
        return jsonNoStore({ error: 'Invalid JSON body' }, 400);
    }

    const size = parsed.body.size;
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
        return jsonNoStore({ error: 'Invalid file size' }, 400);
    }
    const maxBytes = getMaxFileSizeBytes();
    if (size > maxBytes) {
        return jsonNoStore({ error: `File too large; max ${maxBytes} bytes` }, 400);
    }

    const s3Key = `f/${randomUUID()}`;
    const uploadToken = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + UPLOAD_SESSION_TTL_MS;

    // Store the upload session before signing the PUT URL so that even if the
    // signer throws we never hand the client a URL without a matching token.
    const stored = await getValkey().set(
        `${UPLOAD_TOKEN_PREFIX}${uploadToken}`,
        JSON.stringify({ s3Key, expectedSize: size, ip: clientIp, expiresAt }),
        'PX',
        UPLOAD_SESSION_TTL_MS,
        'NX',
    );
    if (stored !== 'OK') {
        // Vanishingly unlikely (43-byte token collision); treat as 500.
        return jsonNoStore({ error: 'Failed to allocate upload session' }, 500);
    }

    let presignedUrl: string;
    try {
        presignedUrl = await getPresignedPutUrl({
            key: s3Key,
            contentLength: size,
            expiresIn: PRESIGN_URL_TTL_SECONDS,
        });
    } catch (err) {
        // Roll back the upload session so the token can't be reused.
        await getValkey()
            .del(`${UPLOAD_TOKEN_PREFIX}${uploadToken}`)
            .catch(() => undefined);
        const message = err instanceof Error ? err.message : 'Failed to sign upload URL';
        return jsonNoStore({ error: message }, 500);
    }

    return jsonNoStore(
        {
            s3Key,
            uploadToken,
            presignedUrl,
            expiresIn: PRESIGN_URL_TTL_SECONDS,
            maxSize: maxBytes,
        },
        200,
    );
}
