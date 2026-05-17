import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getValkey } from '@/lib/valkey-client';

// Stub env up-front so the s3-client module's lazy validation does not fail
// at module load if the test machine has no real S3 config. Individual tests
// can override these via vi.stubEnv.
process.env.S3_ENDPOINT = 'https://s3.example.com';
process.env.S3_REGION = 'us-east-1';
process.env.S3_BUCKET = 'burnotes-files';
process.env.S3_ACCESS_KEY = 'AKIATESTACCESSKEY';
process.env.S3_SECRET_KEY = 'testsecretkey';
process.env.TRUSTED_PROXY_HOPS = '1';

vi.mock('@/lib/s3-client', () => ({
    getPresignedPutUrl: vi.fn(async () => 'https://s3.example.com/burnotes-files/f/xxx?X-Amz-Signature=fake'),
    getMaxFileSizeBytes: vi.fn(() => 25 * 1024 * 1024),
    headObject: vi.fn(),
}));

import { POST } from '@/app/api/files/presign/route';
import { getMaxFileSizeBytes, getPresignedPutUrl } from '@/lib/s3-client';

const presignMock = getPresignedPutUrl as unknown as ReturnType<typeof vi.fn>;
const maxBytesMock = getMaxFileSizeBytes as unknown as ReturnType<typeof vi.fn>;

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/api/files/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

describe('POST /api/files/presign', () => {
    beforeEach(async () => {
        presignMock.mockReset();
        presignMock.mockResolvedValue('https://s3.example.com/burnotes-files/f/xxx?X-Amz-Signature=fake');
        maxBytesMock.mockReset();
        maxBytesMock.mockReturnValue(25 * 1024 * 1024);
        await getValkey().flushall();
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await getValkey().flushall();
    });

    it('happy path: returns s3Key, uploadToken, presignedUrl', async () => {
        const response = await POST(jsonRequest({ size: 1024 }));
        expect(response.status).toBe(200);
        const data = (await response.json()) as {
            s3Key: string;
            uploadToken: string;
            presignedUrl: string;
            expiresIn: number;
            maxSize: number;
        };
        expect(data.s3Key).toMatch(/^f\/[0-9a-f-]{36}$/);
        expect(data.uploadToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(data.presignedUrl.startsWith('https://')).toBe(true);
        expect(data.expiresIn).toBe(600);
        expect(data.maxSize).toBe(25 * 1024 * 1024);
    });

    it('passes the resolved key + content length to the signer', async () => {
        const response = await POST(jsonRequest({ size: 7777 }));
        expect(response.status).toBe(200);
        const data = (await response.json()) as { s3Key: string };
        expect(presignMock).toHaveBeenCalledWith({
            key: data.s3Key,
            contentLength: 7777,
            expiresIn: 600,
        });
    });

    it('stores the upload session in Valkey under upload:<token> with the declared size', async () => {
        const response = await POST(jsonRequest({ size: 2048 }));
        const data = (await response.json()) as { s3Key: string; uploadToken: string };
        const raw = await getValkey().get(`upload:${data.uploadToken}`);
        expect(raw).not.toBeNull();
        const stored = JSON.parse(raw as string) as { s3Key: string; expectedSize: number };
        expect(stored.s3Key).toBe(data.s3Key);
        expect(stored.expectedSize).toBe(2048);

        const ttl = await getValkey().pttl(`upload:${data.uploadToken}`);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000);
    });

    it('returns 415 when content-type is not JSON', async () => {
        const response = await POST(
            new Request('http://localhost/api/files/presign', {
                method: 'POST',
                headers: { 'content-type': 'text/plain', 'x-forwarded-for': '127.0.0.1' },
                body: 'size=123',
            }),
        );
        expect(response.status).toBe(415);
    });

    it('returns 400 on malformed JSON body', async () => {
        const response = await POST(jsonRequest('{not valid'));
        expect(response.status).toBe(400);
    });

    it('returns 400 when size is missing', async () => {
        const response = await POST(jsonRequest({}));
        expect(response.status).toBe(400);
    });

    it('returns 400 when size is zero', async () => {
        const response = await POST(jsonRequest({ size: 0 }));
        expect(response.status).toBe(400);
    });

    it('returns 400 when size is negative', async () => {
        const response = await POST(jsonRequest({ size: -100 }));
        expect(response.status).toBe(400);
    });

    it('returns 400 when size is not an integer', async () => {
        const response = await POST(jsonRequest({ size: 3.14 }));
        expect(response.status).toBe(400);
    });

    it('returns 400 when size exceeds MAX_FILE_SIZE_BYTES', async () => {
        maxBytesMock.mockReturnValue(1024);
        const response = await POST(jsonRequest({ size: 2048 }));
        expect(response.status).toBe(400);
        const data = (await response.json()) as { error: string };
        expect(data.error).toMatch(/max 1024/);
    });

    it('returns 429 after exceeding the rate limit (10 per 60s per IP)', async () => {
        // First 10 calls should pass.
        for (let i = 0; i < 10; i += 1) {
            const ok = await POST(jsonRequest({ size: 1 }));
            expect(ok.status).toBe(200);
        }
        // The 11th call from the same IP is rate-limited.
        const blocked = await POST(jsonRequest({ size: 1 }));
        expect(blocked.status).toBe(429);
    });

    it('does not call the signer when the session token cannot be allocated', async () => {
        // Force NX collision by pre-filling the namespace key with a sentinel.
        // We can't predict the random token, so we wrap getValkey.set to fail.
        const valkey = getValkey();
        const setSpy = vi.spyOn(valkey, 'set').mockResolvedValueOnce('NOT-OK' as unknown as 'OK');

        const response = await POST(jsonRequest({ size: 1024 }));
        expect(response.status).toBe(500);
        expect(presignMock).not.toHaveBeenCalled();
        setSpy.mockRestore();
    });

    it('rolls the upload session back when the signer throws', async () => {
        presignMock.mockRejectedValueOnce(new Error('signer exploded'));

        const response = await POST(jsonRequest({ size: 1024 }));
        expect(response.status).toBe(500);
        const data = (await response.json()) as { error: string };
        expect(data.error).toMatch(/signer exploded/);

        // After rollback no upload:* key should remain.
        const keys = await getValkey().keys('upload:*');
        expect(keys).toHaveLength(0);
    });
});
