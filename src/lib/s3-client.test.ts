import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_FORCE_PATH_STYLE',
    'MAX_FILE_SIZE_BYTES',
] as const;

const DEFAULT_ENV = {
    S3_ENDPOINT: 'https://s3.example.com',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'burnotes-files',
    S3_ACCESS_KEY: 'AKIATESTACCESSKEY',
    S3_SECRET_KEY: 'testsecretkey',
};

function applyEnv(overrides: Record<string, string | undefined>): void {
    for (const key of ENV_KEYS) {
        const overrideValue = overrides[key];
        if (overrideValue === undefined) {
            delete process.env[key];
        } else {
            vi.stubEnv(key, overrideValue);
        }
    }
}

function resetClient(): void {
    // The module pins the S3Client to globalThis so callers don't pay
    // construction cost on every request. Tests need a clean slate before
    // they re-read env vars, so reset it manually.
    (globalThis as { __s3Client?: unknown }).__s3Client = undefined;
}

async function loadModule(): Promise<typeof import('@/lib/s3-client')> {
    vi.resetModules();
    return await import('@/lib/s3-client');
}

describe('getMaxFileSizeBytes', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('defaults to 25 MiB when MAX_FILE_SIZE_BYTES is unset', async () => {
        applyEnv(DEFAULT_ENV);
        const mod = await loadModule();
        expect(mod.getMaxFileSizeBytes()).toBe(25 * 1024 * 1024);
    });

    it('reads MAX_FILE_SIZE_BYTES from env', async () => {
        applyEnv({ ...DEFAULT_ENV, MAX_FILE_SIZE_BYTES: '1048576' });
        const mod = await loadModule();
        expect(mod.getMaxFileSizeBytes()).toBe(1_048_576);
    });

    it('falls back to default on garbage env values', async () => {
        applyEnv({ ...DEFAULT_ENV, MAX_FILE_SIZE_BYTES: 'not-a-number' });
        const mod = await loadModule();
        expect(mod.getMaxFileSizeBytes()).toBe(25 * 1024 * 1024);
    });

    it('falls back to default on non-positive values', async () => {
        applyEnv({ ...DEFAULT_ENV, MAX_FILE_SIZE_BYTES: '0' });
        const mod = await loadModule();
        expect(mod.getMaxFileSizeBytes()).toBe(25 * 1024 * 1024);
    });
});

describe('S3 client env validation', () => {
    beforeEach(() => {
        resetClient();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        resetClient();
    });

    it('throws on missing S3_ENDPOINT', async () => {
        applyEnv({ ...DEFAULT_ENV, S3_ENDPOINT: undefined });
        const mod = await loadModule();
        await expect(mod.getPresignedPutUrl({ key: 'f/x', contentLength: 1, expiresIn: 10 })).rejects.toThrow(
            /S3_ENDPOINT is not set/,
        );
    });

    it('throws on missing S3_BUCKET', async () => {
        applyEnv({ ...DEFAULT_ENV, S3_BUCKET: undefined });
        const mod = await loadModule();
        await expect(mod.getPresignedPutUrl({ key: 'f/x', contentLength: 1, expiresIn: 10 })).rejects.toThrow(
            /S3_BUCKET is not set/,
        );
    });

    it('throws on malformed endpoint (no protocol)', async () => {
        applyEnv({ ...DEFAULT_ENV, S3_ENDPOINT: 's3.example.com' });
        const mod = await loadModule();
        await expect(mod.getPresignedPutUrl({ key: 'f/x', contentLength: 1, expiresIn: 10 })).rejects.toThrow(
            /not a valid URL/,
        );
    });

    it('throws when endpoint uses ftp protocol', async () => {
        applyEnv({ ...DEFAULT_ENV, S3_ENDPOINT: 'ftp://files.example.com' });
        const mod = await loadModule();
        await expect(mod.getPresignedPutUrl({ key: 'f/x', contentLength: 1, expiresIn: 10 })).rejects.toThrow(
            /must use http\(s\)/,
        );
    });

    it('throws when endpoint includes a path (bucket should live in S3_BUCKET)', async () => {
        applyEnv({ ...DEFAULT_ENV, S3_ENDPOINT: 'https://s3.example.com/some-bucket' });
        const mod = await loadModule();
        await expect(mod.getPresignedPutUrl({ key: 'f/x', contentLength: 1, expiresIn: 10 })).rejects.toThrow(
            /must not contain a path/,
        );
    });

    it('trims surrounding whitespace from S3_ENDPOINT', async () => {
        applyEnv({ ...DEFAULT_ENV, S3_ENDPOINT: '   https://s3.example.com  ' });
        const mod = await loadModule();
        const url = await mod.getPresignedPutUrl({ key: 'f/x', contentLength: 1, expiresIn: 10 });
        expect(new URL(url).host).toBe('burnotes-files.s3.example.com');
    });
});

describe('getPresignedPutUrl', () => {
    beforeEach(() => {
        resetClient();
        applyEnv(DEFAULT_ENV);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        resetClient();
    });

    it('signs Content-Length so S3 enforces upload size', async () => {
        const mod = await loadModule();
        const url = await mod.getPresignedPutUrl({ key: 'f/abc', contentLength: 4096, expiresIn: 600 });
        const parsed = new URL(url);
        const signedHeaders = parsed.searchParams.get('X-Amz-SignedHeaders');
        // Selectel/MinIO/etc reject the PUT when Content-Length is signed
        // but the body length doesn't match. Without this assertion a
        // refactor could silently drop the server-side size enforcement.
        expect(signedHeaders).toMatch(/content-length/);
    });

    it('signs the request with AWS4-HMAC-SHA256', async () => {
        const mod = await loadModule();
        const url = await mod.getPresignedPutUrl({ key: 'f/abc', contentLength: 8, expiresIn: 60 });
        const parsed = new URL(url);
        expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    });

    it('embeds the configured region into the credential scope', async () => {
        applyEnv({ ...DEFAULT_ENV, S3_REGION: 'kz-1' });
        const mod = await loadModule();
        const url = await mod.getPresignedPutUrl({ key: 'f/abc', contentLength: 8, expiresIn: 60 });
        // Credential format: AKIA.../<date>/<region>/s3/aws4_request
        const credential = new URL(url).searchParams.get('X-Amz-Credential') ?? '';
        expect(credential.split('/')[2]).toBe('kz-1');
    });

    it('respects the configured expiry', async () => {
        const mod = await loadModule();
        const url = await mod.getPresignedPutUrl({ key: 'f/abc', contentLength: 8, expiresIn: 123 });
        expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('123');
    });

    it('uses virtual-hosted style by default (bucket in hostname)', async () => {
        const mod = await loadModule();
        const url = await mod.getPresignedPutUrl({ key: 'f/abc', contentLength: 8, expiresIn: 60 });
        expect(new URL(url).host).toBe('burnotes-files.s3.example.com');
    });

    it('switches to path-style when S3_FORCE_PATH_STYLE=true (MinIO mode)', async () => {
        applyEnv({ ...DEFAULT_ENV, S3_FORCE_PATH_STYLE: 'true' });
        const mod = await loadModule();
        const url = await mod.getPresignedPutUrl({ key: 'f/abc', contentLength: 8, expiresIn: 60 });
        const parsed = new URL(url);
        expect(parsed.host).toBe('s3.example.com');
        expect(parsed.pathname).toBe('/burnotes-files/f/abc');
    });
});

describe('headObject', () => {
    const s3Mock = mockClient(S3Client);

    beforeEach(() => {
        resetClient();
        applyEnv(DEFAULT_ENV);
        s3Mock.reset();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        resetClient();
        s3Mock.reset();
    });

    it('returns the content length and etag when the object exists', async () => {
        s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 4096, ETag: '"deadbeef"' });
        const mod = await loadModule();
        const result = await mod.headObject('f/exists');
        expect(result).toEqual({ contentLength: 4096, etag: '"deadbeef"' });
    });

    it('returns null when the SDK rejects with NotFound', async () => {
        s3Mock.on(HeadObjectCommand).rejects(Object.assign(new Error('NotFound'), { name: 'NotFound' }));
        const mod = await loadModule();
        expect(await mod.headObject('f/missing')).toBeNull();
    });

    it('returns null when the SDK rejects with NoSuchKey (Selectel/DO variant)', async () => {
        s3Mock.on(HeadObjectCommand).rejects(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
        const mod = await loadModule();
        expect(await mod.headObject('f/missing')).toBeNull();
    });

    it('returns null when the request hangs beyond the 2s timeout', async () => {
        s3Mock.on(HeadObjectCommand).callsFake(() => new Promise(() => undefined));
        const mod = await loadModule();
        vi.useFakeTimers();
        try {
            const promise = mod.headObject('f/hanging');
            await vi.advanceTimersByTimeAsync(3_000);
            expect(await promise).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });
});
