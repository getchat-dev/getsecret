// Shared image-preview helpers for the create form and the viewer.
//
// Two MIME-source contexts use this:
//   - sender: a freshly picked browser `File` with its native `type` and `name`
//   - receiver: a decrypted file-container payload (Blob + meta.mime/meta.filename)
//
// The helpers take a small `{ type, name }` hint so both contexts can share
// the same detection and decode pipeline. HEIC/HEIF is decoded via `heic-to`
// (libheif WASM), dynamically imported so its bundle never reaches users who
// don't drop or receive a HEIC.

// Allowlist instead of `image/*` because Chrome/Firefox can't decode HEIC/HEIF
// natively (Safari can), JPEG 2000, etc. Rendering them via <img> shows a
// broken-image glyph. Stick to formats every evergreen browser handles.
const PREVIEWABLE_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/svg+xml',
    'image/bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
]);

export type ImageHint = { type: string; name: string };

// Both MIME and extension because some upload paths (older drag sources,
// mobile browsers, some Android pickers) leave `type` empty for HEIC/HEIF.
export function isHeicCandidate(hint: ImageHint): boolean {
    const type = hint.type.toLowerCase();
    if (type === 'image/heic' || type === 'image/heif') return true;
    if (type === 'image/heic-sequence' || type === 'image/heif-sequence') return true;
    const name = hint.name.toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif');
}

export function isNativePreviewable(hint: ImageHint): boolean {
    return PREVIEWABLE_IMAGE_TYPES.has(hint.type);
}

// Anything we can render either natively or after HEIC conversion. Use this
// to decide whether the sender's "preview image" checkbox should appear, and
// whether the receiver should attempt to auto-preview.
export function isImageCandidate(hint: ImageHint): boolean {
    return isNativePreviewable(hint) || isHeicCandidate(hint);
}

export type ImagePreviewHandle = {
    // Resolves to a blob URL ready to set on an <img>, or null if the input
    // wasn't actually decodable (false-positive HEIC extension, decode error,
    // CSP blocking WASM, etc). Callers should fall back to a placeholder on
    // null.
    promise: Promise<string | null>;
    // Cancels the pending decode and revokes any URL we already created. Idempotent.
    abort: () => void;
};

// Decode a blob to an object-URL suitable for an <img src>. Returns null if
// the input doesn't look like an image we can show; otherwise returns the
// async handle described above. Native formats resolve synchronously inside a
// microtask; HEIC pays the cost of dynamic import + WASM decode (Web Worker
// via heic-to/next, so the main thread stays responsive).
export function decodeImagePreview(blob: Blob, hint: ImageHint): ImagePreviewHandle | null {
    if (isNativePreviewable(hint)) {
        const url = URL.createObjectURL(blob);
        let revoked = false;
        return {
            promise: Promise.resolve(url),
            abort: () => {
                if (revoked) return;
                revoked = true;
                URL.revokeObjectURL(url);
            },
        };
    }

    if (!isHeicCandidate(hint)) return null;

    let aborted = false;
    let convertedUrl: string | null = null;
    const promise = (async () => {
        try {
            const { heicTo, isHeic } = await import('heic-to/next');
            if (aborted) return null;
            // `isHeic` wants a File for its byte sniff. Wrap the blob if
            // needed; the wrapper is zero-copy (File is a Blob subclass).
            const fileLike = blob instanceof File ? blob : new File([blob], hint.name, { type: hint.type });
            if (!(await isHeic(fileLike))) return null;
            const jpeg = await heicTo({ blob: fileLike, type: 'image/jpeg', quality: 0.85 });
            if (aborted) return null;
            convertedUrl = URL.createObjectURL(jpeg);
            return convertedUrl;
        } catch (err) {
            // Decode failure (corrupt file, unsupported HEIC variant, CSP
            // blocking WASM / blob worker) — caller falls back gracefully.
            console.error('heic preview decode failed', err);
            return null;
        }
    })();

    return {
        promise,
        abort: () => {
            if (aborted) return;
            aborted = true;
            if (convertedUrl) URL.revokeObjectURL(convertedUrl);
        },
    };
}
