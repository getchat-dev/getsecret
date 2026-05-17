import { headObject } from '@/lib/s3-client';
import type { FileAttachment } from '@/lib/secret-store';
import { getValkey } from '@/lib/valkey-client';

// Server-side binding between a presigned upload (created by POST /api/files/presign)
// and the subsequent POST /api/secrets call that attaches the resulting S3
// object to a new secret. The token is single-use and HEAD-verified against
// the live S3 object before we trust any client-supplied size.

const UPLOAD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UPLOAD_TOKEN_PREFIX = 'upload:';

type StoredSession = {
    s3Key: string;
    expectedSize: number;
    ip: string;
    expiresAt: number;
};

export type ResolvedUploadSession =
    | { ok: true; file: FileAttachment }
    | { ok: false; reason: 'invalid-format' | 'not-found' | 'storage-error' | 'object-missing' | 'size-mismatch' };

export function isValidUploadToken(value: unknown): value is string {
    return typeof value === 'string' && UPLOAD_TOKEN_PATTERN.test(value);
}

export async function resolveAndConsumeUploadSession(uploadToken: string): Promise<ResolvedUploadSession> {
    if (!isValidUploadToken(uploadToken)) {
        return { ok: false, reason: 'invalid-format' };
    }

    const valkey = getValkey();
    const key = `${UPLOAD_TOKEN_PREFIX}${uploadToken}`;
    // Single-use: GETDEL atomically reads and removes the session so two
    // concurrent /api/secrets calls cannot race on the same token.
    let raw: string | null;
    try {
        raw = await valkey.getdel(key);
    } catch {
        return { ok: false, reason: 'storage-error' };
    }
    if (!raw) {
        return { ok: false, reason: 'not-found' };
    }

    let session: StoredSession;
    try {
        session = JSON.parse(raw) as StoredSession;
    } catch {
        return { ok: false, reason: 'not-found' };
    }
    if (typeof session.s3Key !== 'string' || typeof session.expectedSize !== 'number') {
        return { ok: false, reason: 'not-found' };
    }

    // HEAD the S3 object to confirm: (a) it actually exists; (b) its size
    // matches what we presigned. Without this the client could create a
    // secret pointing at any UUID-like key — empty, missing, or wrong size.
    const head = await headObject(session.s3Key);
    if (!head) {
        return { ok: false, reason: 'object-missing' };
    }
    if (typeof head.contentLength !== 'number' || head.contentLength !== session.expectedSize) {
        return { ok: false, reason: 'size-mismatch' };
    }

    return { ok: true, file: { s3Key: session.s3Key, size: session.expectedSize } };
}
