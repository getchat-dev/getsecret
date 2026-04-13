import { beforeEach, describe, expect, it } from 'vitest';
import { POST as consumeSecret } from '@/app/api/secrets/[id]/route';
import { POST as createSecret } from '@/app/api/secrets/route';
import { rateLimiter } from '@/lib/rate-limit';
import { decryptSecret, type EncryptedSecret, prepareSecretUpload } from '@/lib/secret-crypto';
import { SECRET_TTL_SECONDS, secretStore } from '@/lib/secret-store';

type SecretStoreInternals = {
    store: Map<string, unknown>;
};

type RateLimiterInternals = {
    buckets: Map<string, unknown>;
};

function clearState() {
    (secretStore as unknown as SecretStoreInternals).store.clear();
    (rateLimiter as unknown as RateLimiterInternals).buckets.clear();
}

describe('secret API routes', () => {
    beforeEach(() => {
        clearState();
    });

    it('creates and consumes a secret through the API', async () => {
        const secret = 'launch code: 1234';
        const prepared = await prepareSecretUpload(secret);

        const createResponse = await createSecret(
            new Request('http://localhost/api/secrets', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': '127.0.0.1',
                },
                body: JSON.stringify({
                    id: prepared.id,
                    encryptedSecret: prepared.encryptedSecret,
                    accessToken: prepared.accessToken,
                }),
            }),
        );

        expect(createResponse.status).toBe(201);

        const createData = (await createResponse.json()) as {
            id: string;
            path: string;
            expiresInSeconds: number;
        };

        expect(createData).toMatchObject({
            id: prepared.id,
            path: `/s/${prepared.id}`,
            expiresInSeconds: SECRET_TTL_SECONDS,
        });

        const consumeResponse = await consumeSecret(
            new Request(`http://localhost/api/secrets/${prepared.id}`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': '127.0.0.1',
                },
                body: JSON.stringify({
                    accessToken: prepared.accessToken,
                }),
            }),
            { params: Promise.resolve({ id: prepared.id }) },
        );

        expect(consumeResponse.status).toBe(200);

        const consumeData = (await consumeResponse.json()) as {
            encryptedSecret: EncryptedSecret;
        };

        expect(await decryptSecret(prepared.key, consumeData.encryptedSecret)).toBe(secret);

        const secondConsumeResponse = await consumeSecret(
            new Request(`http://localhost/api/secrets/${prepared.id}`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': '127.0.0.1',
                },
                body: JSON.stringify({
                    accessToken: prepared.accessToken,
                }),
            }),
            { params: Promise.resolve({ id: prepared.id }) },
        );

        expect(secondConsumeResponse.status).toBe(404);
    });

    it('rejects secret creation without a JSON content type', async () => {
        const response = await createSecret(
            new Request('http://localhost/api/secrets', {
                method: 'POST',
                body: 'plain text body',
            }),
        );

        expect(response.status).toBe(415);
        await expect(response.json()).resolves.toEqual({
            error: 'Invalid content type',
        });
    });
});
