'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ImageLightbox, ImagePreview, type PreviewFile } from '@/components/secret/image-lightbox';
import type { AttachedFile } from '@/components/secret/viewer';
import { ActionLabel } from '@/components/ui/action-label';
import { FileIcon } from '@/components/ui/icons';
import { decodeContainer } from '@/lib/file-container';
import { sanitizeFilename } from '@/lib/secret-filename';
import { COMMAND } from '@/lib/ui-commands';
import btn from '@/styles/primitives/button.module.css';
import styles from './revealed-secret.module.css';

function saveFile(file: PreviewFile) {
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

export function AttachmentViewer({ file }: { file: AttachedFile }) {
    const t = useTranslations('revealed');
    const tErrors = useTranslations('errors');
    const restricted = file.restrictDownload === true;
    const preview = file.previewImage || restricted;
    const [requested, setRequested] = useState(preview);
    const [attempt, setAttempt] = useState(0);
    const [files, setFiles] = useState<PreviewFile[] | null>(null);
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
                            <ImagePreview file={entry} restricted={restricted} onOpen={() => setLightboxIndex(index)} />
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
                <ImageLightbox
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
