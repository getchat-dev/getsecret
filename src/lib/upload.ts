import { encodeContainer, FILE_CONTAINER_KEY_BYTES } from '@/lib/file-container';
import type { FileRef } from '@/lib/secret-crypto';

// Client-side file upload orchestrator. Encrypts the file into an opaque
// container, asks the server for a presigned PUT URL, uploads the container
// to S3, and returns the data the caller needs to bind the file to a secret:
//
//   - fileRef:     { s3Key, keyB64 } — goes inside the encrypted plaintext
//                  envelope so the server never sees the file's key.
//   - uploadToken: opaque server-allocated token — goes alongside the secret
//                  create request so the server can HEAD-verify the upload.
//
// Encryption uses a fresh 32-byte K_file; the same key is never reused across
// files. We rely on XMLHttpRequest for the PUT step so we can surface upload
// progress to the UI (fetch upload progress is not yet portable).

export type PresignResponse = {
    s3Key: string;
    uploadToken: string;
    presignedUrl: string;
    expiresIn: number;
    maxSize: number;
};

export type UploadProgress = {
    loaded: number;
    total: number;
};

export type UploadResult = {
    fileRef: FileRef;
    uploadToken: string;
    size: number;
};

export type UploadOptions = {
    onProgress?: (progress: UploadProgress) => void;
    signal?: AbortSignal;
};

function encodeBase64Url(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function requestPresign(size: number, signal?: AbortSignal): Promise<PresignResponse> {
    let response: Response;
    try {
        response = await fetch('/api/files/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ size }),
            signal,
        });
    } catch (err) {
        if (signal?.aborted) throw new Error('Upload aborted');
        throw new Error(err instanceof Error ? err.message : 'Network error while requesting upload URL');
    }
    if (!response.ok) {
        let message = 'Failed to request upload URL';
        try {
            const data = (await response.json()) as { error?: string };
            if (data && typeof data.error === 'string') message = data.error;
        } catch {
            // ignore
        }
        throw new Error(message);
    }
    return (await response.json()) as PresignResponse;
}

function putWithProgress(url: string, body: Uint8Array, options: UploadOptions): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        // S3-compatible servers reject the PUT if Content-Length does not match
        // the signed value; browsers set it automatically for ArrayBuffer/Blob.
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && options.onProgress) {
                options.onProgress({ loaded: event.loaded, total: event.total });
            }
        });
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
        if (options.signal) {
            if (options.signal.aborted) {
                xhr.abort();
                reject(new Error('Upload aborted'));
                return;
            }
            options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
        }
        // Cast to BodyInit-compatible (XHR accepts ArrayBufferView).
        xhr.send(body);
    });
}

export async function uploadFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    const fileBytes = await file.arrayBuffer();

    const keyBytes = crypto.getRandomValues(new Uint8Array(FILE_CONTAINER_KEY_BYTES));
    const container = await encodeContainer(
        fileBytes,
        { filename: file.name || 'file', mime: file.type || 'application/octet-stream', size: file.size },
        keyBytes,
    );

    if (options.signal?.aborted) throw new Error('Upload aborted');

    const presign = await requestPresign(container.length, options.signal);
    await putWithProgress(presign.presignedUrl, container, options);

    return {
        fileRef: { s3Key: presign.s3Key, keyB64: encodeBase64Url(keyBytes) },
        uploadToken: presign.uploadToken,
        size: container.length,
    };
}
