'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { useClipboardCopy } from '@/components/copy-button';
import { CheckIcon, CopyIcon } from '@/components/ui/icons';
import { renderQrPngDataUrl, renderQrSvg } from '@/lib/qr';

type Props = {
    link: string;
    open: boolean;
    onClose: () => void;
};

function readThemeColors(): { dark: string; light: string } {
    if (typeof window === 'undefined') {
        return { dark: '#0a0d12', light: '#ffffff' };
    }
    const styles = getComputedStyle(document.documentElement);
    const fg = styles.getPropertyValue('--fg-default').trim() || '#0a0d12';
    const bg = styles.getPropertyValue('--bg-1').trim() || '#ffffff';
    return { dark: fg, light: bg };
}

function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header?.match(/data:([^;]+);base64/);
    const mime = mimeMatch?.[1] ?? 'application/octet-stream';
    const binary = atob(base64 ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
}

export function QrModal({ link, open, onClose }: Props) {
    const t = useTranslations('generated');
    const tCreate = useTranslations('create');
    const titleId = useId();
    const [svg, setSvg] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const onCloseRef = useRef(onClose);
    const { copyStatus, copyText } = useClipboardCopy();
    const isCopied = copyStatus === 'copied';

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) {
            setSvg(null);
            return;
        }

        let cancelled = false;
        const colors = readThemeColors();
        renderQrSvg(link, { color: { dark: colors.dark, light: colors.light } })
            .then((rendered) => {
                if (!cancelled) setSvg(rendered);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [open, link]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (open && !dialog.open) {
            dialog.showModal();
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = previousOverflow;
            };
        }

        if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        function handleClose() {
            onCloseRef.current();
        }

        dialog.addEventListener('close', handleClose);
        return () => {
            dialog.removeEventListener('close', handleClose);
        };
    }, []);

    function handleDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }

    async function handleDownloadSvg() {
        const colors = readThemeColors();
        const rendered = await renderQrSvg(link, { color: { dark: colors.dark, light: colors.light } });
        downloadBlob('burnotes-secret-qr.svg', new Blob([rendered], { type: 'image/svg+xml' }));
    }

    async function handleDownloadPng() {
        const colors = readThemeColors();
        const dataUrl = await renderQrPngDataUrl(link, { color: { dark: colors.dark, light: colors.light } });
        downloadBlob('burnotes-secret-qr.png', dataUrlToBlob(dataUrl));
    }

    return (
        <dialog ref={dialogRef} className="qr-modal" aria-labelledby={titleId} onClick={handleDialogClick}>
            <div className="qr-modal-inner">
                <header className="qr-modal-header">
                    <h2 id={titleId} className="qr-modal-title">
                        {t('qrTitle')}
                    </h2>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={onClose}
                        aria-label={t('qrClose')}
                    >
                        <span aria-hidden="true">×</span>
                    </button>
                </header>
                <div className="qr-modal-body">
                    {svg ? (
                        <div
                            className="qr-canvas"
                            role="img"
                            aria-label={t('qrTitle')}
                            // biome-ignore lint/security/noDangerouslySetInnerHtml: qrcode lib output is structural SVG of <rect> nodes; payload is encoded as modules, not as markup
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                    ) : (
                        <div className="qr-canvas" aria-hidden="true">
                            <span className="qr-canvas-placeholder">…</span>
                        </div>
                    )}
                    <p className="qr-modal-subtitle">{t('qrSubtitle')}</p>
                </div>
                <footer className="qr-modal-footer">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                            void copyText(link, {
                                successMessage: t('copied'),
                                errorMessage: tCreate('formatLabel'),
                            })
                        }
                    >
                        {isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        <span>{isCopied ? t('copied') : t('copy')}</span>
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => void handleDownloadSvg()}>
                        {t('qrDownloadSvg')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => void handleDownloadPng()}>
                        {t('qrDownloadPng')}
                    </button>
                </footer>
            </div>
        </dialog>
    );
}
