'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import type { AttachedFile } from '@/components/secret/viewer';
import { EyeIcon, EyeOffIcon, FileIcon, PlusIcon, UnlockIcon } from '@/components/ui/icons';
import { useRouter } from '@/i18n/navigation';
import { decodeContainer } from '@/lib/file-container';
import { decodeImagePreview, type ImagePreviewHandle } from '@/lib/image-preview';
import type { SecretFormat } from '@/lib/secret-formats';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

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
            return;
        }
        let cancelled = false;
        let imageHandle: ImagePreviewHandle | null = null;
        setPreviewState({ status: 'loading' });
        void (async () => {
            try {
                const response = await fetch(file.signedGetUrl, { cache: 'no-store' });
                if (!response.ok) {
                    if (!cancelled) setPreviewState({ status: 'unavailable' });
                    return;
                }
                const ciphertext = new Uint8Array(await response.arrayBuffer());
                if (cancelled) return;
                const keyBytes = decodeBase64Url(file.fileRef.keyB64);
                const decoded = await decodeContainer(ciphertext, keyBytes);
                if (cancelled) return;
                const blob = new Blob([new Uint8Array(decoded.bytes)], {
                    type: decoded.meta.mime || 'application/octet-stream',
                });
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
                if (!cancelled) setPreviewState({ status: 'unavailable' });
            }
        })();
        return () => {
            cancelled = true;
            if (imageHandle) imageHandle.abort();
        };
    }, [file]);

    async function handleDownload() {
        if (!file || isDownloading) return;
        setDownloadError(null);
        setIsDownloading(true);
        let blobUrl: string | null = null;
        try {
            const response = await fetch(file.signedGetUrl, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(response.status === 404 ? tErrors('fileExpired') : tErrors('downloadFailed'));
            }
            const ciphertext = new Uint8Array(await response.arrayBuffer());
            const keyBytes = decodeBase64Url(file.fileRef.keyB64);
            const decoded = await decodeContainer(ciphertext, keyBytes);
            const blob = new Blob([new Uint8Array(decoded.bytes)], {
                type: decoded.meta.mime || 'application/octet-stream',
            });
            blobUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = decoded.meta.filename || 'attachment';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
        } catch (err) {
            setDownloadError(err instanceof Error ? err.message : tErrors('downloadFailed'));
        } finally {
            setIsDownloading(false);
            if (blobUrl) {
                // Hold the Blob URL just long enough for the browser to start
                // the download, then revoke so the decrypted file is not
                // pinned in memory.
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
                            <img src={previewState.url} alt={t('attachmentLabel')} className="attachment-preview" />
                        ) : null}
                        <div className="attachment-row">
                            <FileIcon size={16} />
                            <span className="attachment-label">{t('attachmentLabel')}</span>
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
