import { DEFAULT_EXPIRATION_SECONDS, isValidExpirationSeconds } from '@/lib/expiration';
import { isMultiReadEnabled, isPasswordEnabled } from '@/lib/feature-flags';
import { getClientIp, jsonNoStore, readJsonBody } from '@/lib/http';
import { DEFAULT_MAX_VIEWS, isValidMaxViews } from '@/lib/max-views';
import { isValidPasswordParams, isValidPasswordVerifierHash } from '@/lib/password-derive';
import { rateLimiter } from '@/lib/rate-limit';
import {
    hashAccessToken,
    isValidAccessToken,
    isValidEncryptedSecret,
    isValidSecretId,
    SECRET_VERSION_V2,
} from '@/lib/secret-crypto';
import { DEFAULT_SECRET_FORMAT, isSecretFormat } from '@/lib/secret-formats';
import { secretStore } from '@/lib/secret-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CREATE_LIMIT = 30;
const CREATE_WINDOW_MS = 60_000;
const CREATE_MAX_BODY_BYTES = 128 * 1024;

type CreateSecretBody = {
    id?: unknown;
    encryptedSecret?: unknown;
    accessToken?: unknown;
    expiresInSeconds?: unknown;
    format?: unknown;
    maxViews?: unknown;
    passwordParams?: unknown;
    passwordVerifierHash?: unknown;
};

export async function POST(request: Request) {
    const clientIp = getClientIp(request);
    if (await rateLimiter.isLimited(`create:${clientIp}`, CREATE_LIMIT, CREATE_WINDOW_MS)) {
        return jsonNoStore({ error: 'Too many requests' }, 429);
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
        return jsonNoStore({ error: 'Invalid content type' }, 415);
    }

    const parsed = await readJsonBody<CreateSecretBody>(request, CREATE_MAX_BODY_BYTES);
    if (!parsed.ok) {
        if (parsed.error === 'body-too-large') {
            return jsonNoStore({ error: 'Payload too large' }, 413);
        }
        return jsonNoStore({ error: 'Invalid JSON body' }, 400);
    }

    const body = parsed.body;

    if (typeof body.id !== 'string' || !isValidSecretId(body.id)) {
        return jsonNoStore({ error: 'Invalid secret id' }, 400);
    }

    if (!isValidEncryptedSecret(body.encryptedSecret)) {
        return jsonNoStore({ error: 'Invalid encrypted secret payload' }, 400);
    }

    if (typeof body.accessToken !== 'string' || !isValidAccessToken(body.accessToken)) {
        return jsonNoStore({ error: 'Invalid secret access token' }, 400);
    }

    const expiresInSeconds = body.expiresInSeconds ?? DEFAULT_EXPIRATION_SECONDS;
    if (!isValidExpirationSeconds(expiresInSeconds)) {
        return jsonNoStore({ error: 'Invalid expiration' }, 400);
    }

    let format = DEFAULT_SECRET_FORMAT;
    if (body.format !== undefined) {
        if (!isSecretFormat(body.format)) {
            return jsonNoStore({ error: 'Invalid format' }, 400);
        }
        format = body.format;
    }

    let maxViews: number | null = DEFAULT_MAX_VIEWS;
    if (body.maxViews !== undefined) {
        if (!isValidMaxViews(body.maxViews)) {
            return jsonNoStore({ error: 'Invalid max views' }, 400);
        }
        maxViews = body.maxViews;
    }
    // Feature gate: while multi-read is disabled (default during a rolling
    // deploy until every instance is on this version), coerce any non-default
    // request back to single-read so old instances reading these records
    // through the legacy CONSUME_SCRIPT still match the stored semantics.
    if (!isMultiReadEnabled()) {
        maxViews = DEFAULT_MAX_VIEWS;
    }

    // Password params and verifier hash come together or not at all. The v2
    // secret payload (double-layer ciphertext with an inner IV) is only valid
    // alongside password params; a plain v2 envelope from the client is a
    // contract violation we reject.
    const hasPasswordRequest = body.passwordParams !== undefined || body.passwordVerifierHash !== undefined;
    if (hasPasswordRequest) {
        if (!isPasswordEnabled()) {
            return jsonNoStore({ error: 'Password protection is disabled' }, 400);
        }
        if (!isValidPasswordParams(body.passwordParams) || !isValidPasswordVerifierHash(body.passwordVerifierHash)) {
            return jsonNoStore({ error: 'Invalid password params' }, 400);
        }
        if (body.encryptedSecret.version !== SECRET_VERSION_V2) {
            return jsonNoStore({ error: 'Password-protected payload must be v2' }, 400);
        }
    } else if (body.encryptedSecret.version === SECRET_VERSION_V2) {
        return jsonNoStore({ error: 'v2 payload requires password params' }, 400);
    }

    const accessTokenHash = await hashAccessToken(body.accessToken);
    const createdSecret = await secretStore.create(
        body.id,
        body.encryptedSecret,
        accessTokenHash,
        expiresInSeconds,
        format,
        maxViews,
        hasPasswordRequest && isValidPasswordParams(body.passwordParams) ? body.passwordParams : null,
        hasPasswordRequest && isValidPasswordVerifierHash(body.passwordVerifierHash) ? body.passwordVerifierHash : null,
    );
    if (!createdSecret) {
        return jsonNoStore({ error: 'Secret id already exists' }, 409);
    }

    return jsonNoStore(
        {
            id: body.id,
            path: `/s/${body.id}`,
            expiresAt: createdSecret.expiresAt,
            expiresInSeconds,
            maxViews,
        },
        201,
    );
}
