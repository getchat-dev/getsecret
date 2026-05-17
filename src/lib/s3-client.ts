import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    type HeadObjectCommandOutput,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Provider-agnostic S3 wrapper. Works with any S3-compatible service:
// AWS S3, DigitalOcean Spaces, Cloudflare R2, MinIO, Wasabi, Backblaze B2.
// The `endpoint`/`region`/`forcePathStyle` triplet is what differs between
// providers; everything else is the same.
//
// We validate env at first use (not at module load) to keep server start cheap
// when the S3 feature is not exercised — same pattern as src/lib/valkey-client.ts.

const REQUIRED_ENV = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const;

const HEAD_TIMEOUT_MS = 2_000;

declare global {
    // eslint-disable-next-line no-var
    var __s3Client: S3Client | undefined;
}

function readEnv(): {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
} {
    for (const name of REQUIRED_ENV) {
        if (!process.env[name]) {
            throw new Error(`${name} is not set; file uploads require an S3-compatible storage`);
        }
    }
    const rawEndpoint = (process.env.S3_ENDPOINT as string).trim();
    // Validate the endpoint up front so SDK calls don't fail later with a
    // cryptic "Invalid URL". Common mistakes: missing scheme, bucket appended
    // as a path segment, or accidental quoting in the .env file.
    let parsed: URL;
    try {
        parsed = new URL(rawEndpoint);
    } catch {
        throw new Error(
            `S3_ENDPOINT is not a valid URL (got "${rawEndpoint}"); expected something like "https://s3.example.com"`,
        );
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`S3_ENDPOINT must use http(s) (got protocol "${parsed.protocol}")`);
    }
    if (parsed.pathname !== '/' && parsed.pathname !== '') {
        throw new Error(
            `S3_ENDPOINT must not contain a path (got "${parsed.pathname}"); the bucket name belongs in S3_BUCKET`,
        );
    }
    return {
        endpoint: parsed.origin,
        region: process.env.S3_REGION as string,
        bucket: process.env.S3_BUCKET as string,
        accessKey: process.env.S3_ACCESS_KEY as string,
        secretKey: process.env.S3_SECRET_KEY as string,
        // path-style is required for MinIO and some local dev S3 servers; AWS
        // and DO use virtual-hosted style. Default off to match the more common
        // cloud case; opt in via env for MinIO.
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    };
}

function getClient(): S3Client {
    if (!globalThis.__s3Client) {
        const env = readEnv();
        globalThis.__s3Client = new S3Client({
            endpoint: env.endpoint,
            region: env.region,
            credentials: { accessKeyId: env.accessKey, secretAccessKey: env.secretKey },
            forcePathStyle: env.forcePathStyle,
            // AWS SDK v3 (>=3.700) injects a CRC32 "flexible checksum" middleware
            // by default, which adds an `x-amz-sdk-checksum-algorithm=CRC32` query
            // param to presigned URLs and forces the browser to ask for the
            // matching `x-amz-checksum-crc32` request header during CORS preflight.
            // Most S3-compatible providers (Selectel, DO Spaces, Backblaze, R2)
            // don't accept that header and return 403 on the preflight. We
            // dial it back so the SDK only adds a checksum when the operation
            // actually requires one (which PutObject does not).
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
        });
    }
    return globalThis.__s3Client;
}

function getBucket(): string {
    return readEnv().bucket;
}

export function getMaxFileSizeBytes(): number {
    const raw = process.env.MAX_FILE_SIZE_BYTES;
    if (!raw) return 25 * 1024 * 1024; // 25 MiB
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 25 * 1024 * 1024;
    return parsed;
}

export type PresignedPutResult = {
    s3Key: string;
    presignedUrl: string;
    expiresIn: number;
};

export async function getPresignedPutUrl(opts: {
    key: string;
    contentLength: number;
    expiresIn: number;
}): Promise<string> {
    const client = getClient();
    // ContentLength is signed into the URL: most S3-compatible servers
    // (including MinIO, AWS, and DO) reject a PUT whose Content-Length header
    // does not match the signed value, which gives us server-side size
    // enforcement without falling back to POST + content-length-range.
    const command = new PutObjectCommand({
        Bucket: getBucket(),
        Key: opts.key,
        ContentLength: opts.contentLength,
    });
    return getSignedUrl(client, command, { expiresIn: opts.expiresIn, signableHeaders: new Set(['content-length']) });
}

export async function getPresignedGetUrl(opts: { key: string; expiresIn: number }): Promise<string> {
    const client = getClient();
    const command = new GetObjectCommand({ Bucket: getBucket(), Key: opts.key });
    return getSignedUrl(client, command, { expiresIn: opts.expiresIn });
}

export type HeadObjectResult = {
    contentLength: number | undefined;
    etag: string | undefined;
};

export async function headObject(key: string): Promise<HeadObjectResult | null> {
    const client = getClient();
    const command = new HeadObjectCommand({ Bucket: getBucket(), Key: key });
    try {
        const result = (await Promise.race([
            client.send(command),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('S3 HEAD timeout')), HEAD_TIMEOUT_MS)),
        ])) as HeadObjectCommandOutput;
        return { contentLength: result.ContentLength, etag: result.ETag };
    } catch {
        // Either 404 (NotFound), 403 (NoSuchKey on some providers), or timeout.
        // Caller treats any null as "object not found / cannot verify" and rejects.
        return null;
    }
}

export async function deleteObject(key: string): Promise<void> {
    const client = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}
