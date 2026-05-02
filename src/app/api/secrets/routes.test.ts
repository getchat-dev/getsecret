import { beforeEach, describe, expect, it } from 'vitest';
import { POST as consumeSecret } from '@/app/api/secrets/[id]/route';
import { POST as createSecret } from '@/app/api/secrets/route';
import { MAX_EXPIRATION_SECONDS } from '@/lib/expiration';
import { decryptSecret, type EncryptedSecret, prepareSecretUpload } from '@/lib/secret-crypto';
import { SECRET_TTL_SECONDS } from '@/lib/secret-store';
import { getValkey } from '@/lib/valkey-client';

describe('secret API routes', () => {
    beforeEach(async () => {
        await getValkey().flushall();
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

    it('rejects create requests whose content-length exceeds the cap', async () => {
        const oversized = 'a'.repeat(200_000);
        const response = await createSecret(
            new Request('http://localhost/api/secrets', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': '200000',
                    'x-forwarded-for': '127.0.0.1',
                },
                body: JSON.stringify({ padding: oversized }),
            }),
        );

        expect(response.status).toBe(413);
        await expect(response.json()).resolves.toEqual({
            error: 'Payload too large',
        });
    });

    it('rejects create requests whose body streams past the cap even if content-length is small', async () => {
        const encoder = new TextEncoder();
        const oversizedPayload = encoder.encode(`{"padding":"${'a'.repeat(200_000)}"}`);
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(oversizedPayload);
                controller.close();
            },
        });

        const response = await createSecret(
            new Request('http://localhost/api/secrets', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': '127.0.0.1',
                },
                body: stream,
                // @ts-expect-error duplex is required for streaming bodies
                duplex: 'half',
            }),
        );

        expect(response.status).toBe(413);
    });

    it('honours a custom expiresInSeconds and echoes it back', async () => {
        const prepared = await prepareSecretUpload('custom-ttl payload');
        const customTtl = 2 * 60 * 60;

        const response = await createSecret(
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
                    expiresInSeconds: customTtl,
                }),
            }),
        );

        expect(response.status).toBe(201);
        const data = (await response.json()) as { expiresInSeconds: number };
        expect(data.expiresInSeconds).toBe(customTtl);
    });

    it('rejects expiresInSeconds above MAX_EXPIRATION_SECONDS', async () => {
        const prepared = await prepareSecretUpload('too-long payload');

        const response = await createSecret(
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
                    expiresInSeconds: MAX_EXPIRATION_SECONDS + 1,
                }),
            }),
        );

        expect(response.status).toBe(400);
    });

    it('rejects non-integer expiresInSeconds', async () => {
        const prepared = await prepareSecretUpload('non-integer ttl');

        const response = await createSecret(
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
                    expiresInSeconds: 3.14,
                }),
            }),
        );

        expect(response.status).toBe(400);
    });

    it('honours maxViews and burns the secret after the limit is reached', async () => {
        const prepared = await prepareSecretUpload('multi-read payload');

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
                    maxViews: 3,
                }),
            }),
        );
        expect(createResponse.status).toBe(201);
        const createData = (await createResponse.json()) as { maxViews: number };
        expect(createData.maxViews).toBe(3);

        for (let i = 2; i >= 0; i -= 1) {
            const consume = await consumeSecret(
                new Request(`http://localhost/api/secrets/${prepared.id}`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-forwarded-for': '127.0.0.1',
                    },
                    body: JSON.stringify({ accessToken: prepared.accessToken }),
                }),
                { params: Promise.resolve({ id: prepared.id }) },
            );
            expect(consume.status).toBe(200);
            const data = (await consume.json()) as { viewsRemaining: number };
            expect(data.viewsRemaining).toBe(i);
        }

        const fourth = await consumeSecret(
            new Request(`http://localhost/api/secrets/${prepared.id}`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': '127.0.0.1',
                },
                body: JSON.stringify({ accessToken: prepared.accessToken }),
            }),
            { params: Promise.resolve({ id: prepared.id }) },
        );
        expect(fourth.status).toBe(404);
    });

    it('treats maxViews=null as unlimited and reports viewsRemaining as null', async () => {
        const prepared = await prepareSecretUpload('unlimited payload');

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
                    maxViews: null,
                }),
            }),
        );
        expect(createResponse.status).toBe(201);

        for (let i = 0; i < 4; i += 1) {
            const consume = await consumeSecret(
                new Request(`http://localhost/api/secrets/${prepared.id}`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-forwarded-for': '127.0.0.1',
                    },
                    body: JSON.stringify({ accessToken: prepared.accessToken }),
                }),
                { params: Promise.resolve({ id: prepared.id }) },
            );
            expect(consume.status).toBe(200);
            const data = (await consume.json()) as { viewsRemaining: number | null };
            expect(data.viewsRemaining).toBeNull();
        }
    });

    it('rejects an out-of-range maxViews', async () => {
        const prepared = await prepareSecretUpload('bad views');

        const response = await createSecret(
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
                    maxViews: 50,
                }),
            }),
        );
        expect(response.status).toBe(400);
    });

    it('rejects consume requests with oversized bodies', async () => {
        const validId = 'a'.repeat(43);
        const response = await consumeSecret(
            new Request(`http://localhost/api/secrets/${validId}`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': '50000',
                    'x-forwarded-for': '127.0.0.1',
                },
                body: JSON.stringify({ accessToken: 'x'.repeat(50_000) }),
            }),
            { params: Promise.resolve({ id: validId }) },
        );

        expect(response.status).toBe(413);
    });
});
