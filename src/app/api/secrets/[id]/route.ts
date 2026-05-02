import { getClientIp, jsonNoStore, readJsonBody } from '@/lib/http';
import { rateLimiter } from '@/lib/rate-limit';
import { hashAccessToken, isValidAccessToken, isValidSecretId } from '@/lib/secret-crypto';
import { secretStore } from '@/lib/secret-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSUME_LIMIT = 120;
const CONSUME_WINDOW_MS = 60_000;
const CONSUME_MAX_BODY_BYTES = 1024;

type ConsumeSecretBody = {
    accessToken?: unknown;
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

    const accessTokenHash = await hashAccessToken(body.accessToken);
    const consumed = await secretStore.consume(id, accessTokenHash);
    if (!consumed) {
        return jsonNoStore({ error: 'Secret not found or expired' }, 404);
    }

    return jsonNoStore({ encryptedSecret: consumed.encryptedSecret, format: consumed.format }, 200);
}
