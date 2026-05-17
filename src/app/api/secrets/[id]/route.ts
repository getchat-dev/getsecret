import { getClientIp, jsonNoStore, readJsonBody } from '@/lib/http';
import { hashPasswordVerifier, isValidPasswordVerifier } from '@/lib/password-derive';
import { rateLimiter } from '@/lib/rate-limit';
import { getPresignedGetUrl } from '@/lib/s3-client';
import { hashAccessToken, isValidAccessToken, isValidSecretId } from '@/lib/secret-crypto';
import { secretStore } from '@/lib/secret-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSUME_LIMIT = 120;
const CONSUME_WINDOW_MS = 60_000;
const CONSUME_MAX_BODY_BYTES = 1024;
const FILE_GET_URL_TTL_SECONDS = 300;

type ConsumeSecretBody = {
    accessToken?: unknown;
    passwordVerifier?: unknown;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const clientIp = getClientIp(request);
    if (await rateLimiter.isLimited(`consume:${clientIp}`, CONSUME_LIMIT, CONSUME_WINDOW_MS)) {
        return jsonNoStore({ error: 'Too many requests' }, 429);
    }

    const { id } = await params;

    if (!isValidSecretId(id)) {
        return jsonNoStore({ error: 'Invalid secret id' }, 400);
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
        return jsonNoStore({ error: 'Invalid content type' }, 415);
    }

    const parsed = await readJsonBody<ConsumeSecretBody>(request, CONSUME_MAX_BODY_BYTES);
    if (!parsed.ok) {
        if (parsed.error === 'body-too-large') {
            return jsonNoStore({ error: 'Payload too large' }, 413);
        }
        return jsonNoStore({ error: 'Invalid JSON body' }, 400);
    }

    const body = parsed.body;

    if (typeof body.accessToken !== 'string' || !isValidAccessToken(body.accessToken)) {
        return jsonNoStore({ error: 'Invalid secret access token' }, 400);
    }

    let passwordVerifierHash: string | null = null;
    if (body.passwordVerifier !== undefined) {
        if (!isValidPasswordVerifier(body.passwordVerifier)) {
            return jsonNoStore({ error: 'Invalid password verifier' }, 400);
        }
        passwordVerifierHash = await hashPasswordVerifier(body.passwordVerifier);
    }

    const accessTokenHash = await hashAccessToken(body.accessToken);
    const consumed = await secretStore.consume(id, accessTokenHash, passwordVerifierHash);
    if (!consumed) {
        return jsonNoStore({ error: 'Secret not found or expired' }, 404);
    }

    // If this secret had an attached file, sign a short-lived GET URL the
    // client uses to fetch the encrypted container from S3. We deliberately
    // do NOT eagerly delete the object on the destroyed-view: the signed URL
    // has a 5-minute TTL, but a race with our own DELETE could 404 the
    // legitimate download. Bucket lifecycle (2 days) is the cleanup mechanism.
    let file: { signedGetUrl: string; expiresIn: number } | null = null;
    if (consumed.fileS3Key) {
        try {
            const signedGetUrl = await getPresignedGetUrl({
                key: consumed.fileS3Key,
                expiresIn: FILE_GET_URL_TTL_SECONDS,
            });
            file = { signedGetUrl, expiresIn: FILE_GET_URL_TTL_SECONDS };
        } catch {
            // S3 outage / config error — the secret still reveals correctly,
            // the client just can't download the attachment.
            file = null;
        }
    }

    return jsonNoStore(
        {
            encryptedSecret: consumed.encryptedSecret,
            format: consumed.format,
            viewsRemaining: consumed.viewsRemaining,
            ...(file ? { file } : {}),
        },
        200,
    );
}
