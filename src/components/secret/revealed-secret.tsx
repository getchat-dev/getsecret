'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import type { AttachedFile } from '@/components/secret/viewer';
import { EyeIcon, EyeOffIcon, FileIcon, PlusIcon, UnlockIcon } from '@/components/ui/icons';
import { useRouter } from '@/i18n/navigation';
import { decodeContainer } from '@/lib/file-container';
import { decodeImagePreview, type ImagePreviewHandle } from '@/lib/image-preview';
import type { SecretFormat } from '@/lib/secret-formats';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

// Upper bound for how long a Download click will block waiting for an
// in-flight preview decrypt to finish before falling back to a fresh fetch.
// 5s comfortably covers a typical S3 GET + container AES-GCM decrypt for a
// 25 MB attachment over a slow mobile link; longer than that and the user
// has waited enough — start the second fetch in parallel and accept the cost.
const PREVIEW_HANDOFF_TIMEOUT_MS = 5000;

type DecryptedFile = { blob: Blob; filename: string };

function decodeBase64Url(value: string): Uint8Array {
    if (!BASE64URL_PATTERN.test(value)) {
        throw new Error('Invalid base64url');
    }
    const padded = value
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

type Props = {
    content: string;
    format: SecretFormat;
    viewsRemaining: number | null;
    file?: AttachedFile | null;
};

type PreviewState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; url: string }
    | { status: 'unavailable' };

export function RevealedSecret({ content, format, viewsRemaining, file = null }: Props) {
    const t = useTranslations('revealed');
    const tErrors = useTranslations('errors');
    const router = useRouter();
    const [hidden, setHidden] = useState(false);
    const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' });
    // Filename surfaces in the UI as soon as either the preview effect or the
    // first manual download has decrypted the container. Until then we fall
    // back to the generic "Attached file" label — the filename lives inside
    // the encrypted container, not in the envelope, so it's literally unknown
    // before we've fetched + AES-GCM-decrypted at least once. Reactive via
    // state (rather than the ref below) because the label re-renders on it.
    const [attachmentName, setAttachmentName] = useState<string | null>(null);
    // Cache the decrypted file once the auto-preview path has done the fetch +
    // container decode. The manual Download button reuses these bytes instead
    // of re-fetching from S3 and running the AES-GCM container decrypt a
    // second time. Held in a ref because nothing in the JSX depends on its
    // value — only handleDownload reads it, and we want the freshest possible
    // value at click time (state would lag behind by a render cycle if the
    // preview just finished). The same Blob is referenced by the preview's
    // object URL, so storing it here doesn't grow JS heap; it only keeps a
    // reference that GC would otherwise reclaim when the effect's local
    // `decoded` variable went out of scope.
    const decryptedFileRef = useRef<DecryptedFile | null>(null);
    // Lets a Download click that lands while the preview is still decrypting
    // wait on the same in-flight work instead of kicking off a parallel fetch.
    // Set when the preview effect starts; resolved when the effect either
    // populates decryptedFileRef or gives up. Null when no preview is being
    // attempted (previewImage=false), in which case handleDownload skips
    // straight to its own fetch.
    const decryptionPromiseRef = useRef<Promise<DecryptedFile | null> | null>(null);

    useEffect(() => {
        if (format === 'plain') {
            setHighlightedHtml('');
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const { highlightSafe } = await import('@/lib/highlight-secret');
                if (cancelled) return;
                setHighlightedHtml(highlightSafe(content, format));
            } catch (err) {
                // Surface the failure in the console so we don't silently
                // fall back to unstyled plaintext on regressions in the
                // hljs/DOMPurify chain — the user still sees content (the
                // safe fallback), but a dev catches the breakage immediately.
                console.error('[burnotes] highlight failed, falling back to raw text', err);
                if (!cancelled) setHighlightedHtml('');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [content, format]);

    const showHighlighted = format !== 'plain' && highlightedHtml !== null && highlightedHtml.length > 0;

    // Auto-preview path: when the sender opted in (file.previewImage = true)
    // we fetch the encrypted container ourselves, decrypt it, and hand the
    // bytes to the shared image-preview helper. Anything that goes wrong
    // (network, container auth fail, not actually a decodable image, HEIC
    // worker blocked) downgrades to the existing manual download button —
    // we never block the recipient from seeing/saving the file just because
    // we can't render a thumbnail. This effect runs at most once per reveal
    // (file is set when the parent transitions to revealed and never mutates
    // afterwards).
    useEffect(() => {
        if (!file?.previewImage) {
            setPreviewState({ status: 'idle' });
            decryptionPromiseRef.current = null;
            return;
        }
        let cancelled = false;
        let imageHandle: ImagePreviewHandle | null = null;
        // Set up the handoff promise immediately so a Download click that
        // races the very first await below still has something to wait on.
        // `resolveDecryption` is wrapped to be idempotent — multiple paths
        // (fast success, image-decode failure, network error, unmount)
        // can call it, and only the first one matters.
        let resolveDecryption: ((value: DecryptedFile | null) => void) | null = null;
        decryptionPromiseRef.current = new Promise<DecryptedFile | null>((r) => {
            resolveDecryption = r;
        });
        const resolveHandoff = (value: DecryptedFile | null) => {
            if (resolveDecryption) {
                resolveDecryption(value);
                resolveDecryption = null;
            }
        };

        setPreviewState({ status: 'loading' });
        void (async () => {
            try {
                const response = await fetch(file.signedGetUrl, { cache: 'no-store' });
                if (!response.ok) {
                    resolveHandoff(null);
                    if (!cancelled) setPreviewState({ status: 'unavailable' });
                    return;
                }
                const ciphertext = new Uint8Array(await response.arrayBuffer());
                if (cancelled) {
                    resolveHandoff(null);
                    return;
                }
                const keyBytes = decodeBase64Url(file.fileRef.keyB64);
                const decoded = await decodeContainer(ciphertext, keyBytes);
                if (cancelled) {
                    resolveHandoff(null);
                    return;
                }
                const blob = new Blob([new Uint8Array(decoded.bytes)], {
                    type: decoded.meta.mime || 'application/octet-stream',
                });
                // Hand the Blob to the manual Download path BEFORE attempting
                // image decode. The bytes are valid regardless of whether
                // they're a recognizable image — downstream image decode might
                // still return null (false-positive MIME, HEIC worker blocked)
                // and we don't want that to invalidate a perfectly downloadable
                // file the user already paid for.
                const cached: DecryptedFile = { blob, filename: decoded.meta.filename || 'attachment' };
                decryptedFileRef.current = cached;
                if (decoded.meta.filename) setAttachmentName(decoded.meta.filename);
                resolveHandoff(cached);
                imageHandle = decodeImagePreview(blob, {
                    type: decoded.meta.mime,
                    name: decoded.meta.filename,
                });
                if (!imageHandle) {
                    setPreviewState({ status: 'unavailable' });
                    return;
                }
                const url = await imageHandle.promise;
                if (cancelled) return;
                setPreviewState(url ? { status: 'ready', url } : { status: 'unavailable' });
            } catch (err) {
                console.error('[burnotes] auto-preview failed', err);
                resolveHandoff(null);
                if (!cancelled) setPreviewState({ status: 'unavailable' });
            }
        })();
        return () => {
            cancelled = true;
            // Unblock any waiting Download click so it falls through to its
            // own fetch instead of hanging on a promise nobody will resolve.
            resolveHandoff(null);
            if (imageHandle) imageHandle.abort();
        };
    }, [file]);

    async function handleDownload() {
        if (!file || isDownloading) return;
        setDownloadError(null);
        setIsDownloading(true);
        let blobUrl: string | null = null;
        try {
            // Three-tier acquisition order, each cheaper than the next falls back to:
            //   1. Cache already populated — preview finished, or this is a repeat click.
            //   2. Preview in flight — race it against PREVIEW_HANDOFF_TIMEOUT_MS;
            //      the button stays in its `isDownloading` (loader) state for the
            //      whole wait, so the user gets visible feedback instead of an
            //      apparently-frozen UI.
            //   3. Fresh fetch + container decrypt.
            // (1) and (2) avoid a duplicate signed-URL GET and a duplicate AES-GCM
            // decrypt; (3) is the unconditional fallback that covers
            // previewImage=false and any preview that took longer than 5s.
            let cached: DecryptedFile | null = decryptedFileRef.current;
            if (!cached && decryptionPromiseRef.current) {
                cached = await Promise.race([
                    decryptionPromiseRef.current,
                    new Promise<null>((r) => setTimeout(() => r(null), PREVIEW_HANDOFF_TIMEOUT_MS)),
                ]);
            }

            let blob: Blob;
            let filename: string;
            if (cached) {
                blob = cached.blob;
                filename = cached.filename;
            } else {
                const response = await fetch(file.signedGetUrl, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(response.status === 404 ? tErrors('fileExpired') : tErrors('downloadFailed'));
                }
                const ciphertext = new Uint8Array(await response.arrayBuffer());
                const keyBytes = decodeBase64Url(file.fileRef.keyB64);
                const decoded = await decodeContainer(ciphertext, keyBytes);
                blob = new Blob([new Uint8Array(decoded.bytes)], {
                    type: decoded.meta.mime || 'application/octet-stream',
                });
                filename = decoded.meta.filename || 'attachment';
                // Populate the cache so a second click is free too (matters
                // even without auto-preview, e.g. user downloads, decides to
                // re-save under a different name).
                decryptedFileRef.current = { blob, filename };
                if (decoded.meta.filename) setAttachmentName(decoded.meta.filename);
            }
            blobUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
        } catch (err) {
            setDownloadError(err instanceof Error ? err.message : tErrors('downloadFailed'));
        } finally {
            setIsDownloading(false);
            if (blobUrl) {
                // Hold the anchor's Blob URL just long enough for the browser
                // to start the download, then revoke it. The underlying Blob
                // stays alive via decryptedFileRef — only the URL handle is
                // released here.
                setTimeout(() => {
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                }, 1500);
            }
        }
    }

    const hasText = content.length > 0;

    return (
        <section className="card fade-up">
            <header className="card-header">
                <span className="card-header-title">{t('plaintext')}</span>
                <span className="card-header-meta">
                    {hasText ? (
                        <>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                onClick={() => setHidden((v) => !v)}
                                aria-label={hidden ? 'show' : 'hide'}
                            >
                                {hidden ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
                            </button>
                            <CopyButton
                                textToCopy={content}
                                copyLabel={t('copyClip')}
                                copiedLabel={t('copyClip')}
                                successMessage={t('copiedToast')}
                                errorMessage={tErrors('copyFailed')}
                            />
                        </>
                    ) : null}
                </span>
            </header>
            <div className="card-body">
                {hasText ? (
                    <div className="secret-output">
                        <pre className={`secret-output-content ${hidden ? 'masked' : ''}`.trim()}>
                            {showHighlighted ? (
                                <code
                                    className={`hljs language-${format}`}
                                    // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js output is post-processed through DOMPurify (allow-list: span + class only) in the useEffect above, so only sanitized markup ever reaches this prop.
                                    dangerouslySetInnerHTML={{ __html: highlightedHtml as string }}
                                />
                            ) : (
                                content
                            )}
                        </pre>
                    </div>
                ) : null}
                {file ? (
                    <div className="attachment">
                        {previewState.status === 'ready' ? (
                            <img
                                src={previewState.url}
                                alt={attachmentName ?? t('attachmentLabel')}
                                className="attachment-preview"
                            />
                        ) : null}
                        <div className="attachment-row">
                            <FileIcon size={16} />
                            <span className="attachment-label" title={attachmentName ?? undefined}>
                                {attachmentName ?? t('attachmentLabel')}
                            </span>
                            {previewState.status === 'loading' ? (
                                <span className="attachment-preview-status">{t('previewLoading')}</span>
                            ) : null}
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={handleDownload}
                                disabled={isDownloading}
                            >
                                {isDownloading ? t('downloading') : t('download')}
                            </button>
                            {downloadError ? <span className="attachment-error">{downloadError}</span> : null}
                        </div>
                    </div>
                ) : null}
                <div className="banner banner-success">
                    <UnlockIcon size={16} className="icon" />
                    <span>
                        {viewsRemaining === null ? (
                            <>
                                <strong>{t('multiReadTitle')}</strong> {t('multiReadBodyUnlimited')}
                            </>
                        ) : viewsRemaining > 0 ? (
                            <>
                                <strong>{t('multiReadTitle')}</strong> {t('multiReadBody', { count: viewsRemaining })}
                            </>
                        ) : (
                            <>
                                <strong>{t('burnedTitle')}</strong> {t('burnedBody')}
                            </>
                        )}
                    </span>
                </div>
            </div>
            <footer className="card-footer">
                <button type="button" className="btn btn-secondary" onClick={() => router.push('/')}>
                    <PlusIcon size={14} /> {t('shareBack')}
                </button>
            </footer>
        </section>
    );
}
