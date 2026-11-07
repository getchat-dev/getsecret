'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { AttachmentViewer } from '@/components/secret/attachment-viewer';
import { SecretNameLabel } from '@/components/secret/secret-name';
import type { AttachedFile } from '@/components/secret/viewer';
import { ActionLabel } from '@/components/ui/action-label';
import { DownloadIcon, EyeIcon, EyeOffIcon, PlusIcon, UnlockIcon } from '@/components/ui/icons';
import { useRouter } from '@/i18n/navigation';
import { DEFAULT_SECRET_FILENAME } from '@/lib/secret-filename';
import { SECRET_FORMAT_EXTENSIONS, type SecretFormat } from '@/lib/secret-formats';
import { COMMAND } from '@/lib/ui-commands';
import banner from '@/styles/primitives/banner.module.css';
import btn from '@/styles/primitives/button.module.css';
import card from '@/styles/primitives/card.module.css';
import styles from './revealed-secret.module.css';

// While the secret is revealed, leaving the tab/window starts this countdown;
// if the viewer doesn't come back before it elapses, the secret is re-masked
// so an abandoned, unlocked tab doesn't leave plaintext on screen.
const AUTO_HIDE_MS = 10_000;

type Props = {
    content: string;
    // Sender-chosen base name from the envelope; null for secrets created
    // before names existed or left at the default.
    name?: string | null;
    // Used when `name` is null.
    defaultFilename?: string;
    format: SecretFormat;
    viewsRemaining: number | null;
    file?: AttachedFile | null;
};

export function RevealedSecret({
    content,
    name = null,
    defaultFilename = DEFAULT_SECRET_FILENAME,
    format,
    viewsRemaining,
    file = null,
}: Props) {
    const t = useTranslations('revealed');
    const tErrors = useTranslations('errors');
    const router = useRouter();
    const [hidden, setHidden] = useState(false);
    const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
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

    // Auto-conceal on inattention. While the secret is revealed, leaving the
    // tab (visibilitychange → hidden) or the window (blur) starts a countdown;
    // if the viewer comes back (focus / visible) before AUTO_HIDE_MS we stand
    // down, otherwise we re-mask. The setTimeout fires reliably for the
    // blur-but-still-visible case (a tab left on screen while the user steps
    // away — the actual shoulder-surf risk). A backgrounded tab can throttle
    // or freeze the timer, so the return handler re-checks the real elapsed
    // time and conceals anyway if it crossed the threshold.
    useEffect(() => {
        if (hidden || content.length === 0) return;

        let awayTimer: ReturnType<typeof setTimeout> | null = null;
        let awaySince: number | null = null;

        const conceal = () => {
            awayTimer = null;
            awaySince = null;
            setHidden(true);
        };
        const leave = () => {
            if (awaySince !== null) return; // already counting down
            awaySince = Date.now();
            awayTimer = setTimeout(conceal, AUTO_HIDE_MS);
        };
        const cancel = () => {
            if (awayTimer) clearTimeout(awayTimer);
            awayTimer = null;
            awaySince = null;
        };
        const ret = () => {
            if (awaySince !== null && Date.now() - awaySince >= AUTO_HIDE_MS) conceal();
            else cancel();
        };
        const onVisibility = () => {
            if (document.hidden) leave();
            else ret();
        };

        window.addEventListener('blur', leave);
        window.addEventListener('focus', ret);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            cancel();
            window.removeEventListener('blur', leave);
            window.removeEventListener('focus', ret);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [hidden, content]);

    const hasText = content.length > 0;
    const textFilename = `${name ?? defaultFilename}.${SECRET_FORMAT_EXTENSIONS[format]}`;

    // The text never left this tab in plaintext; a same-origin blob: URL
    // hands it to the browser's download manager without another request.
    function handleDownloadText() {
        const blobUrl = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = textFilename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    }

    return (
        <section className={`${card.card} fade-up`}>
            <header className={card.header}>
                {hasText ? (
                    <SecretNameLabel value={name ?? defaultFilename} extension={SECRET_FORMAT_EXTENSIONS[format]} />
                ) : (
                    <span className={card.headerTitle}>{t('plaintext')}</span>
                )}
                <span className={card.headerMeta}>
                    {hasText ? (
                        <>
                            <button
                                type="button"
                                className={`${btn.btn} ${btn.btnGhost} ${btn.btnIcon}`}
                                onClick={() => setHidden((v) => !v)}
                                aria-label={hidden ? 'show' : 'hide'}
                            >
                                {hidden ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
                            </button>
                            <button
                                type="button"
                                className={`${btn.btn} ${btn.btnGhost} ${btn.btnIcon}`}
                                onClick={handleDownloadText}
                                aria-label={t('downloadText', { filename: textFilename })}
                                title={t('downloadText', { filename: textFilename })}
                            >
                                <DownloadIcon size={14} />
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
            <div className={card.body}>
                {hasText ? (
                    <div className={styles.output}>
                        <pre className={`${styles.content} ${hidden ? styles.masked : ''}`.trim()}>
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
                {file ? <AttachmentViewer key={file.fileRef.s3Key} file={file} /> : null}
                <div className={`${banner.banner} ${banner.success}`}>
                    <UnlockIcon size={16} className={banner.icon} />
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
            <footer className={card.footer}>
                <button type="button" className={`${btn.btn} ${btn.btnSecondary}`} onClick={() => router.push('/')}>
                    <PlusIcon size={14} />
                    <ActionLabel command={COMMAND.newSecret}>{t('shareBack')}</ActionLabel>
                </button>
            </footer>
        </section>
    );
}
