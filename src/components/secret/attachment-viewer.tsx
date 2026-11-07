'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { AttachedFile } from '@/components/secret/viewer';
import { ActionLabel } from '@/components/ui/action-label';
import { FileIcon } from '@/components/ui/icons';
import { decodeContainer } from '@/lib/file-container';
import { decodeImageBitmap, decodeImagePreview } from '@/lib/image-preview';
import { sanitizeFilename } from '@/lib/secret-filename';
import { COMMAND } from '@/lib/ui-commands';
import btn from '@/styles/primitives/button.module.css';
import styles from './revealed-secret.module.css';

type DecryptedFile = { blob: Blob; filename: string; mime: string };

function saveFile(file: DecryptedFile) {
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.filename;
    document.body.appendChild(anchor);
    try {
        anchor.click();
    } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
}

function AttachmentImage({
    file,
    restricted,
    onOpen,
}: {
    file: DecryptedFile;
    restricted: boolean;
    onOpen?: () => void;
}) {
    const t = useTranslations('revealed');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [url, setUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [attempt, setAttempt] = useState(0);

    // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries failed loading without changing the source.
    useEffect(() => {
        let cancelled = false;
        let image: HTMLImageElement | null = null;
        const canvas = canvasRef.current;
        const hint = { type: file.mime, name: file.filename };
        // SVG Blob decoding is not supported by createImageBitmap in Chrome.
        const useBitmap = restricted && file.mime !== 'image/svg+xml';
        const handle = useBitmap ? null : decodeImagePreview(file.blob, hint);
        const draw = (source: CanvasImageSource, width: number, height: number) => {
            const context = canvas?.getContext('2d');
            if (!canvas || !context || !width || !height) throw new Error('Canvas unavailable');
            // Bound gallery bitmap memory; the source file can be much larger than its preview.
            const scale = Math.min(1, 2048 / Math.max(width, height));
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            // shortcut: restricted animated images show one frame; add playback if needed.
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
            setStatus('ready');
        };
        setStatus('loading');
        setUrl(null);
        void (async () => {
            try {
                if (useBitmap) {
                    const bitmap = await decodeImageBitmap(file.blob, hint);
                    try {
                        if (!cancelled) draw(bitmap, bitmap.width, bitmap.height);
                    } finally {
                        bitmap.close();
                    }
                    return;
                }
                const imageUrl = await handle?.promise;
                if (cancelled) return;
                if (!imageUrl) throw new Error('Image unavailable');
                if (!restricted) {
                    setUrl(imageUrl);
                    setStatus('ready');
                    return;
                }
                image = new Image();
                image.onload = () => {
                    if (cancelled || !canvas || !image) return;
                    try {
                        draw(image, image.naturalWidth, image.naturalHeight);
                    } catch {
                        setStatus('error');
                    } finally {
                        image.onload = null;
                        image.onerror = null;
                        image.src = '';
                        handle?.abort();
                    }
                };
                image.onerror = () => setStatus('error');
                image.src = imageUrl;
            } catch {
                if (!cancelled) setStatus('error');
            }
        })();
        return () => {
            cancelled = true;
            handle?.abort();
            if (image) {
                image.onload = null;
                image.onerror = null;
                image.src = '';
            }
            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
            }
        };
    }, [file, restricted, attempt]);

    const image = restricted ? (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label={file.filename}
            hidden={status !== 'ready'}
            className={`${styles.attachmentPreview} ${styles.restrictedPreview}`}
            onContextMenu={(event) => event.preventDefault()}
        >
            {file.filename}
        </canvas>
    ) : url && status === 'ready' ? (
        // biome-ignore lint/performance/noImgElement: decrypted blob URL, never sent to an image server.
        <img src={url} alt={file.filename} className={styles.attachmentPreview} onError={() => setStatus('error')} />
    ) : null;

    return (
        <>
            {onOpen ? (
                <button
                    type="button"
                    className={styles.previewButton}
                    aria-label={t('openImage', { filename: file.filename })}
                    aria-haspopup="dialog"
                    disabled={status !== 'ready'}
                    onClick={onOpen}
                >
                    {image}
                </button>
            ) : (
                image
            )}
            {status === 'loading' ? (
                <span className={styles.attachmentPreviewStatus}>{t('previewLoading')}</span>
            ) : null}
            {status === 'error' ? (
                <div role="alert" className={styles.attachmentError}>
                    {t('previewUnavailable')}{' '}
                    <button
                        type="button"
                        className={`${btn.btn} ${btn.btnSecondary}`}
                        onClick={() => setAttempt((value) => value + 1)}
                    >
                        {t('retry')}
                    </button>
                </div>
            ) : null}
        </>
    );
}

function AttachmentLightbox({
    files,
    initialIndex,
    restricted,
    onClose,
}: {
    files: DecryptedFile[];
    initialIndex: number;
    restricted: boolean;
    onClose: () => void;
}) {
    const t = useTranslations('revealed');
    const titleId = useId();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [index, setIndex] = useState(initialIndex);
    const file = files[index];

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, []);

    function move(step: number) {
        setIndex((current) => (current + step + files.length) % files.length);
    }

    return (
        <dialog
            ref={dialogRef}
            className={styles.lightbox}
            aria-labelledby={titleId}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    move(event.key === 'ArrowLeft' ? -1 : 1);
                }
            }}
        >
            <header className={styles.lightboxHeader}>
                <span id={titleId} className={styles.lightboxTitle} title={file.filename}>
                    {file.filename}
                </span>
                <button
                    type="button"
                    className={`${btn.btn} ${btn.btnSecondary} ${styles.lightboxControl}`}
                    aria-label={t('closeImage')}
                    onClick={onClose}
                >
                    <span aria-hidden="true">×</span>
                </button>
            </header>
            <div className={styles.lightboxMedia}>
                <AttachmentImage key={index} file={file} restricted={restricted} />
            </div>
            {files.length > 1 ? (
                <footer className={styles.lightboxNavigation}>
                    <button
                        type="button"
                        className={`${btn.btn} ${btn.btnSecondary} ${styles.lightboxControl}`}
                        aria-label={t('previousImage')}
                        onClick={() => move(-1)}
                    >
                        <span aria-hidden="true">←</span>
                    </button>
                    <span aria-live="polite" aria-atomic="true">
                        {t('imagePosition', { current: index + 1, total: files.length })}
                    </span>
                    <button
                        type="button"
                        className={`${btn.btn} ${btn.btnSecondary} ${styles.lightboxControl}`}
                        aria-label={t('nextImage')}
                        onClick={() => move(1)}
                    >
                        <span aria-hidden="true">→</span>
                    </button>
                </footer>
            ) : null}
        </dialog>
    );
}

export function AttachmentViewer({ file }: { file: AttachedFile }) {
    const t = useTranslations('revealed');
    const tErrors = useTranslations('errors');
    const restricted = file.restrictDownload === true;
    const preview = file.previewImage || restricted;
    const [requested, setRequested] = useState(preview);
    const [attempt, setAttempt] = useState(0);
    const [files, setFiles] = useState<DecryptedFile[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries failed loading without changing the source.
    useEffect(() => {
        if (!requested) return;
        const controller = new AbortController();
        let cancelled = false;
        setLoading(true);
        setError(null);
        void (async () => {
            try {
                const response = await fetch(file.signedGetUrl, { cache: 'no-store', signal: controller.signal });
                if (!response.ok)
                    throw new Error(response.status === 404 ? tErrors('fileExpired') : t('attachmentLoadFailed'));
                const ciphertext = new Uint8Array(await response.arrayBuffer());
                if (cancelled) return;
                const key = file.fileRef.keyB64;
                if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error(t('attachmentLoadFailed'));
                const raw = atob(
                    key
                        .replaceAll('-', '+')
                        .replaceAll('_', '/')
                        .padEnd(Math.ceil(key.length / 4) * 4, '='),
                );
                const decoded = await decodeContainer(
                    ciphertext,
                    Uint8Array.from(raw, (char) => char.charCodeAt(0)),
                );
                if (cancelled) return;
                const entries = decoded.map(({ meta, bytes }) => ({
                    blob: new Blob([bytes], { type: meta.mime || 'application/octet-stream' }),
                    filename: sanitizeFilename(meta.filename) || 'attachment',
                    mime: meta.mime,
                }));
                setFiles(entries);
                if (!preview && entries.length === 1) saveFile(entries[0]);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : t('attachmentLoadFailed'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [file, requested, attempt, preview, t, tErrors]);

    return (
        <div className={styles.attachment}>
            {files ? (
                files.map((entry, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: decrypted container entries never reorder.
                    <div key={index} className={styles.attachment}>
                        {preview ? (
                            <AttachmentImage
                                file={entry}
                                restricted={restricted}
                                onOpen={() => setLightboxIndex(index)}
                            />
                        ) : null}
                        <div className={styles.attachmentRow}>
                            <FileIcon size={16} />
                            <span className={styles.attachmentLabel}>{entry.filename}</span>
                            {!restricted ? (
                                <button
                                    type="button"
                                    className={`${btn.btn} ${btn.btnSecondary}`}
                                    onClick={() => {
                                        try {
                                            saveFile(entry);
                                        } catch {
                                            setError(tErrors('downloadFailed'));
                                        }
                                    }}
                                >
                                    <ActionLabel command={COMMAND.downloadFile}>{t('download')}</ActionLabel>
                                </button>
                            ) : null}
                        </div>
                    </div>
                ))
            ) : (
                <div className={styles.attachmentRow}>
                    <FileIcon size={16} />
                    <span className={styles.attachmentLabel}>{t('attachmentLabel')}</span>
                    {loading || (requested && !error) ? (
                        <span className={styles.attachmentPreviewStatus}>{t('previewLoading')}</span>
                    ) : null}
                    {!requested ? (
                        <button
                            type="button"
                            className={`${btn.btn} ${btn.btnSecondary}`}
                            onClick={() => setRequested(true)}
                        >
                            <ActionLabel command={COMMAND.downloadFile}>{t('download')}</ActionLabel>
                        </button>
                    ) : null}
                </div>
            )}
            {files && lightboxIndex !== null ? (
                <AttachmentLightbox
                    files={files}
                    initialIndex={lightboxIndex}
                    restricted={restricted}
                    onClose={() => setLightboxIndex(null)}
                />
            ) : null}
            {error ? (
                <div role="alert" className={styles.attachmentError}>
                    {error}{' '}
                    <button
                        type="button"
                        className={`${btn.btn} ${btn.btnSecondary}`}
                        onClick={() => setAttempt((value) => value + 1)}
                    >
                        {t('retry')}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
