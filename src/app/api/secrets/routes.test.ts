import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the S3 client so the routes never reach real network and so we can
// drive the upload-session HEAD-verify path through deterministic responses.
vi.mock('@/lib/s3-client', () => ({
    headObject: vi.fn(),
    getPresignedPutUrl: vi.fn(),
    getPresignedGetUrl: vi.fn(async () => 'https://s3.example.com/burnotes-files/f/xxx?X-Amz-Signature=fake-get'),
    getMaxFileSizeBytes: vi.fn(() => 25 * 1024 * 1024),
}));

import { POST as consumeSecret } from '@/app/api/secrets/[id]/route';
import { POST as createSecret } from '@/app/api/secrets/route';
import { MAX_EXPIRATION_SECONDS } from '@/lib/expiration';
import { getPresignedGetUrl, headObject } from '@/lib/s3-client';
import {
    decryptSecret,
    decryptSecretWithPassword,
    deriveVerifierForOpen,
    type EncryptedSecret,
    prepareSecretUpload,
    prepareSecretUploadWithPassword,
} from '@/lib/secret-crypto';
import { SECRET_TTL_SECONDS } from '@/lib/secret-store';
import { getValkey } from '@/lib/valkey-client';

const headObjectMock = headObject as unknown as ReturnType<typeof vi.fn>;
const getPresignedGetUrlMock = getPresignedGetUrl as unknown as ReturnType<typeof vi.fn>;

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

    it('coerces maxViews to single-read when the multi-read feature flag is off', async () => {
        const original = process.env.MULTIREAD_ENABLED;
        process.env.MULTIREAD_ENABLED = 'false';
        try {
            const prepared = await prepareSecretUpload('flag-off payload');
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
                        maxViews: 5,
                    }),
                }),
            );
            expect(response.status).toBe(201);
            const data = (await response.json()) as { maxViews: number | null };
            expect(data.maxViews).toBe(1);

            // First consume succeeds, viewsRemaining=0 (single-read enforced).
            const first = await consumeSecret(
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
            expect(first.status).toBe(200);
            const firstData = (await first.json()) as { viewsRemaining: number | null };
            expect(firstData.viewsRemaining).toBe(0);

            // Second is gone — the feature flag did not silently enable multi-read.
            const second = await consumeSecret(
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
            expect(second.status).toBe(404);
        } finally {
            process.env.MULTIREAD_ENABLED = original;
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

    it('round-trips a password-protected secret end-to-end', async () => {
        const secret = 'eyes-only · double-encrypted';
        const password = 'correct-horse-battery';
        const prepared = await prepareSecretUploadWithPassword(secret, password, 100_000);

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
                    passwordParams: prepared.passwordParams,
                    passwordVerifierHash: prepared.passwordVerifierHash,
                }),
            }),
        );
        expect(createResponse.status).toBe(201);

        const verifier = await deriveVerifierForOpen(password, prepared.passwordParams);
        const consume = await consumeSecret(
            new Request(`http://localhost/api/secrets/${prepared.id}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({ accessToken: prepared.accessToken, passwordVerifier: verifier }),
            }),
            { params: Promise.resolve({ id: prepared.id }) },
        );
        expect(consume.status).toBe(200);
        const consumeData = (await consume.json()) as { encryptedSecret: EncryptedSecret };
        const plaintext = await decryptSecretWithPassword(
            prepared.key,
            consumeData.encryptedSecret,
            password,
            prepared.passwordParams,
        );
        expect(plaintext).toBe(secret);
    });

    it('rejects consume of a password-protected secret without the verifier', async () => {
        const password = 'correct-horse-battery';
        const prepared = await prepareSecretUploadWithPassword('payload', password, 100_000);
        await createSecret(
            new Request('http://localhost/api/secrets', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    id: prepared.id,
                    encryptedSecret: prepared.encryptedSecret,
                    accessToken: prepared.accessToken,
                    passwordParams: prepared.passwordParams,
                    passwordVerifierHash: prepared.passwordVerifierHash,
                }),
            }),
        );

        const consume = await consumeSecret(
            new Request(`http://localhost/api/secrets/${prepared.id}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({ accessToken: prepared.accessToken }),
            }),
            { params: Promise.resolve({ id: prepared.id }) },
        );
        expect(consume.status).toBe(404);
    });

    it('locks out and destroys a password-protected secret after five wrong verifiers', async () => {
        const prepared = await prepareSecretUploadWithPassword('payload', 'right-pw', 100_000);
        await createSecret(
            new Request('http://localhost/api/secrets', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    id: prepared.id,
                    encryptedSecret: prepared.encryptedSecret,
                    accessToken: prepared.accessToken,
                    passwordParams: prepared.passwordParams,
                    passwordVerifierHash: prepared.passwordVerifierHash,
                }),
            }),
        );

        const wrongVerifier = await deriveVerifierForOpen('wrong-pw', prepared.passwordParams);
        for (let i = 0; i < 5; i += 1) {
            const r = await consumeSecret(
                new Request(`http://localhost/api/secrets/${prepared.id}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        accessToken: prepared.accessToken,
                        passwordVerifier: wrongVerifier,
                    }),
                }),
                { params: Promise.resolve({ id: prepared.id }) },
            );
            expect(r.status).toBe(404);
        }

        const correctVerifier = await deriveVerifierForOpen('right-pw', prepared.passwordParams);
        const final = await consumeSecret(
            new Request(`http://localhost/api/secrets/${prepared.id}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    accessToken: prepared.accessToken,
                    passwordVerifier: correctVerifier,
                }),
            }),
            { params: Promise.resolve({ id: prepared.id }) },
        );
        expect(final.status).toBe(404);
    });

    it('rejects password-protected create when the feature flag is off', async () => {
        const original = process.env.PASSWORD_PROTECTION_ENABLED;
        process.env.PASSWORD_PROTECTION_ENABLED = 'false';
        try {
            const prepared = await prepareSecretUploadWithPassword('payload', 'a-strong-pw', 100_000);
            const response = await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: prepared.id,
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                        passwordParams: prepared.passwordParams,
                        passwordVerifierHash: prepared.passwordVerifierHash,
                    }),
                }),
            );
            expect(response.status).toBe(400);
        } finally {
            process.env.PASSWORD_PROTECTION_ENABLED = original;
        }
    });

    it('rejects a v2 envelope without password params', async () => {
        const prepared = await prepareSecretUploadWithPassword('payload', 'a-strong-pw', 100_000);
        const response = await createSecret(
            new Request('http://localhost/api/secrets', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    id: prepared.id,
                    encryptedSecret: prepared.encryptedSecret,
                    accessToken: prepared.accessToken,
                    // intentionally omitted: passwordParams, passwordVerifierHash
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

    describe('file attachments', () => {
        const VALID_UPLOAD_TOKEN = 'z'.repeat(43);

        async function seedUploadSession(token: string, s3Key: string, expectedSize: number): Promise<void> {
            await getValkey().set(
                `upload:${token}`,
                JSON.stringify({ s3Key, expectedSize, ip: '127.0.0.1', expiresAt: Date.now() + 60_000 }),
                'PX',
                600_000,
            );
        }

        beforeEach(() => {
            headObjectMock.mockReset();
            getPresignedGetUrlMock.mockReset();
            getPresignedGetUrlMock.mockResolvedValue(
                'https://s3.example.com/burnotes-files/f/xxx?X-Amz-Signature=fake-get',
            );
        });

        it('binds the file when the upload token resolves and consume returns a signed GET URL', async () => {
            const prepared = await prepareSecretUpload('secret with file');
            const s3Key = 'f/12345678-1234-1234-1234-1234567890ab';
            await seedUploadSession(VALID_UPLOAD_TOKEN, s3Key, 4096);
            headObjectMock.mockResolvedValueOnce({ contentLength: 4096, etag: '"abc"' });

            const createResponse = await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: prepared.id,
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                        uploadToken: VALID_UPLOAD_TOKEN,
                    }),
                }),
            );
            expect(createResponse.status).toBe(201);
            const createData = (await createResponse.json()) as { fileAttached: boolean };
            expect(createData.fileAttached).toBe(true);

            const consumeResponse = await consumeSecret(
                new Request(`http://localhost/api/secrets/${prepared.id}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({ accessToken: prepared.accessToken }),
                }),
                { params: Promise.resolve({ id: prepared.id }) },
            );
            expect(consumeResponse.status).toBe(200);
            const consumeData = (await consumeResponse.json()) as {
                file?: { signedGetUrl: string; expiresIn: number };
            };
            expect(consumeData.file?.signedGetUrl).toContain('https://');
            expect(consumeData.file?.expiresIn).toBe(300);
            expect(getPresignedGetUrlMock).toHaveBeenCalledWith({ key: s3Key, expiresIn: 300 });
        });

        it('omits the file block on consume for a text-only secret', async () => {
            const prepared = await prepareSecretUpload('text only');
            await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: prepared.id,
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                    }),
                }),
            );

            const consumeResponse = await consumeSecret(
                new Request(`http://localhost/api/secrets/${prepared.id}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({ accessToken: prepared.accessToken }),
                }),
                { params: Promise.resolve({ id: prepared.id }) },
            );
            expect(consumeResponse.status).toBe(200);
            const consumeData = (await consumeResponse.json()) as { file?: unknown };
            expect(consumeData.file).toBeUndefined();
            expect(getPresignedGetUrlMock).not.toHaveBeenCalled();
        });

        it('still reveals the secret if the GET URL signer fails (file silently dropped)', async () => {
            const prepared = await prepareSecretUpload('secret with broken signer');
            const s3Key = 'f/12345678-1234-1234-1234-1234567890ac';
            await seedUploadSession(VALID_UPLOAD_TOKEN, s3Key, 100);
            headObjectMock.mockResolvedValueOnce({ contentLength: 100, etag: '"abc"' });
            await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: prepared.id,
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                        uploadToken: VALID_UPLOAD_TOKEN,
                    }),
                }),
            );

            getPresignedGetUrlMock.mockRejectedValueOnce(new Error('signer down'));
            const consumeResponse = await consumeSecret(
                new Request(`http://localhost/api/secrets/${prepared.id}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({ accessToken: prepared.accessToken }),
                }),
                { params: Promise.resolve({ id: prepared.id }) },
            );
            // The secret itself still reveals — only the file block is dropped.
            expect(consumeResponse.status).toBe(200);
            const consumeData = (await consumeResponse.json()) as { file?: unknown };
            expect(consumeData.file).toBeUndefined();
        });

        it('returns 400 on malformed uploadToken (no Valkey/S3 reads)', async () => {
            const prepared = await prepareSecretUpload('payload');
            const response = await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: prepared.id,
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                        uploadToken: 'too-short',
                    }),
                }),
            );
            expect(response.status).toBe(400);
            expect(headObjectMock).not.toHaveBeenCalled();
        });

        it('returns 400 when the upload token does not match a stored session', async () => {
            const prepared = await prepareSecretUpload('payload');
            const response = await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: prepared.id,
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                        uploadToken: VALID_UPLOAD_TOKEN, // no session stored
                    }),
                }),
            );
            expect(response.status).toBe(400);
            const data = (await response.json()) as { error: string };
            expect(data.error).toMatch(/expired|already used/i);
        });

        it('returns 400 when HEAD-verify finds a size mismatch', async () => {
            const prepared = await prepareSecretUpload('payload');
            await seedUploadSession(VALID_UPLOAD_TOKEN, 'f/00000000-0000-0000-0000-000000000099', 1024);
            headObjectMock.mockResolvedValueOnce({ contentLength: 2048, etag: '"x"' });

            const response = await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: prepared.id,
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                        uploadToken: VALID_UPLOAD_TOKEN,
                    }),
                }),
            );
            expect(response.status).toBe(400);
            const data = (await response.json()) as { error: string };
            expect(data.error).toMatch(/size mismatch/i);
        });

        it('upload token is consumed even on size-mismatch (cannot be replayed)', async () => {
            const prepared = await prepareSecretUpload('payload');
            await seedUploadSession(VALID_UPLOAD_TOKEN, 'f/abcd', 1024);
            headObjectMock.mockResolvedValueOnce({ contentLength: 9999, etag: '"x"' });

            await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: prepared.id,
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                        uploadToken: VALID_UPLOAD_TOKEN,
                    }),
                }),
            );

            // Token is gone — second use returns "expired/already used".
            const second = await createSecret(
                new Request('http://localhost/api/secrets', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        id: 'b'.repeat(43),
                        encryptedSecret: prepared.encryptedSecret,
                        accessToken: prepared.accessToken,
                        uploadToken: VALID_UPLOAD_TOKEN,
                    }),
                }),
            );
            expect(second.status).toBe(400);
            const data = (await second.json()) as { error: string };
            expect(data.error).toMatch(/expired|already used/i);
        });

        it('returns 503 when the storage layer errors during HEAD-verify', async () => {
            const prepared = await prepareSecretUpload('payload');
            await seedUploadSession(VALID_UPLOAD_TOKEN, 'f/0011', 100);
            // Force the valkey getdel inside resolveAndConsumeUploadSession to throw.
            const spy = vi.spyOn(getValkey(), 'getdel').mockRejectedValueOnce(new Error('redis down'));
            try {
                const response = await createSecret(
                    new Request('http://localhost/api/secrets', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                        body: JSON.stringify({
                            id: prepared.id,
                            encryptedSecret: prepared.encryptedSecret,
                            accessToken: prepared.accessToken,
                            uploadToken: VALID_UPLOAD_TOKEN,
                        }),
                    }),
                );
                expect(response.status).toBe(503);
            } finally {
                spy.mockRestore();
            }
        });
    });
});
