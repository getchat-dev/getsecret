import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidUploadToken, resolveAndConsumeUploadSession } from '@/lib/upload-session';
import { getValkey } from '@/lib/valkey-client';

vi.mock('@/lib/s3-client', () => ({
    headObject: vi.fn(),
}));

import { headObject } from '@/lib/s3-client';

const headObjectMock = headObject as unknown as ReturnType<typeof vi.fn>;
const VALID_TOKEN = 'a'.repeat(43);
const SECOND_VALID_TOKEN = 'b'.repeat(43);

function storeSession(token: string, body: Record<string, unknown>): Promise<unknown> {
    return getValkey().set(`upload:${token}`, JSON.stringify(body), 'PX', 600_000);
}

describe('isValidUploadToken', () => {
    it('accepts a 43-char base64url string', () => {
        expect(isValidUploadToken(VALID_TOKEN)).toBe(true);
        expect(isValidUploadToken('A1B2-_'.padEnd(43, 'x'))).toBe(true);
    });

    it('rejects wrong length', () => {
        expect(isValidUploadToken('a'.repeat(42))).toBe(false);
        expect(isValidUploadToken('a'.repeat(44))).toBe(false);
    });

    it('rejects non-base64url characters', () => {
        expect(isValidUploadToken(`${'a'.repeat(42)}!`)).toBe(false);
        expect(isValidUploadToken(`${'a'.repeat(42)}/`)).toBe(false);
        expect(isValidUploadToken(`${'a'.repeat(42)}+`)).toBe(false);
        expect(isValidUploadToken(`${'a'.repeat(42)}=`)).toBe(false);
    });

    it('rejects non-string values', () => {
        expect(isValidUploadToken(undefined)).toBe(false);
        expect(isValidUploadToken(null)).toBe(false);
        expect(isValidUploadToken(123)).toBe(false);
        expect(isValidUploadToken({})).toBe(false);
    });
});

describe('resolveAndConsumeUploadSession', () => {
    beforeEach(async () => {
        headObjectMock.mockReset();
        await getValkey().flushall();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await getValkey().flushall();
    });

    it('returns invalid-format when the token shape is wrong', async () => {
        const result = await resolveAndConsumeUploadSession('not-a-real-token');
        expect(result).toEqual({ ok: false, reason: 'invalid-format' });
        expect(headObjectMock).not.toHaveBeenCalled();
    });

    it('returns not-found when no session is stored for the token', async () => {
        const result = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(result).toEqual({ ok: false, reason: 'not-found' });
        expect(headObjectMock).not.toHaveBeenCalled();
    });

    it('returns object-missing when the S3 object cannot be HEAD-verified', async () => {
        await storeSession(VALID_TOKEN, {
            s3Key: 'f/missing-object',
            expectedSize: 1024,
            ip: '127.0.0.1',
            expiresAt: Date.now() + 60_000,
        });
        headObjectMock.mockResolvedValueOnce(null);

        const result = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(result).toEqual({ ok: false, reason: 'object-missing' });
        expect(headObjectMock).toHaveBeenCalledWith('f/missing-object');
    });

    it('returns size-mismatch when the HEAD size differs from the presigned size', async () => {
        await storeSession(VALID_TOKEN, {
            s3Key: 'f/wrong-size',
            expectedSize: 1024,
            ip: '127.0.0.1',
            expiresAt: Date.now() + 60_000,
        });
        headObjectMock.mockResolvedValueOnce({ contentLength: 2048, etag: '"abc"' });

        const result = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(result).toEqual({ ok: false, reason: 'size-mismatch' });
    });

    it('returns size-mismatch when HEAD does not report a content length at all', async () => {
        await storeSession(VALID_TOKEN, {
            s3Key: 'f/no-content-length',
            expectedSize: 1024,
            ip: '127.0.0.1',
            expiresAt: Date.now() + 60_000,
        });
        headObjectMock.mockResolvedValueOnce({ contentLength: undefined, etag: '"abc"' });

        const result = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(result).toEqual({ ok: false, reason: 'size-mismatch' });
    });

    it('returns the file attachment on the happy path', async () => {
        await storeSession(VALID_TOKEN, {
            s3Key: 'f/aabbccdd',
            expectedSize: 4096,
            ip: '127.0.0.1',
            expiresAt: Date.now() + 60_000,
        });
        headObjectMock.mockResolvedValueOnce({ contentLength: 4096, etag: '"abc"' });

        const result = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(result).toEqual({ ok: true, file: { s3Key: 'f/aabbccdd', size: 4096 } });
    });

    it('consumes the token atomically — second resolve sees not-found', async () => {
        await storeSession(VALID_TOKEN, {
            s3Key: 'f/single-use',
            expectedSize: 100,
            ip: '127.0.0.1',
            expiresAt: Date.now() + 60_000,
        });
        headObjectMock.mockResolvedValueOnce({ contentLength: 100, etag: '"x"' });

        const first = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(first.ok).toBe(true);

        const second = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(second).toEqual({ ok: false, reason: 'not-found' });
    });

    it('returns not-found when the stored JSON is malformed', async () => {
        await getValkey().set(`upload:${VALID_TOKEN}`, '{not valid json', 'PX', 600_000);
        const result = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(result).toEqual({ ok: false, reason: 'not-found' });
        expect(headObjectMock).not.toHaveBeenCalled();
    });

    it('returns not-found when stored JSON is the wrong shape (missing s3Key)', async () => {
        await getValkey().set(`upload:${VALID_TOKEN}`, JSON.stringify({ expectedSize: 100 }), 'PX', 600_000);
        const result = await resolveAndConsumeUploadSession(VALID_TOKEN);
        expect(result).toEqual({ ok: false, reason: 'not-found' });
    });

    it('returns storage-error when Valkey getdel throws', async () => {
        const valkey = getValkey();
        const spy = vi.spyOn(valkey, 'getdel').mockRejectedValueOnce(new Error('connection refused'));
        try {
            const result = await resolveAndConsumeUploadSession(SECOND_VALID_TOKEN);
            expect(result).toEqual({ ok: false, reason: 'storage-error' });
        } finally {
            spy.mockRestore();
        }
    });
});
