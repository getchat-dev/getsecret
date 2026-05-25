'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ToastMessage, useClipboardCopy } from '@/components/copy-button';
import { QrModal } from '@/components/secret/qr-modal';
import {
    CheckIcon,
    ClockIcon,
    CopyIcon,
    EyeIcon,
    KeyIcon,
    PlusIcon,
    QrCodeIcon,
    ShareIcon,
    TrashIcon,
} from '@/components/ui/icons';
import type { TtlUnit } from '@/lib/expiration';

type Props = {
    link: string;
    expiresIn: { value: string; unit: TtlUnit };
    maxReads?: number | null;
    hasPassphrase?: boolean;
    onShareAnother: () => void;
};

function splitUrl(url: string): { scheme: string; host: string; path: string; fragment: string } {
    try {
        const parsed = new URL(url);
        const scheme = `${parsed.protocol}//`;
        const host = parsed.host;
        const path = parsed.pathname + parsed.search;
        const fragment = parsed.hash;
        return { scheme, host, path, fragment };
    } catch {
        return { scheme: '', host: url, path: '', fragment: '' };
    }
}

export function GeneratedLink({ link, expiresIn, maxReads, hasPassphrase, onShareAnother }: Props) {
    const t = useTranslations('generated');
    const tErrors = useTranslations('errors');
    const tUnits = useTranslations('create.units');
    const { copyStatus, toast, copyText } = useClipboardCopy();
    const copyButtonRef = useRef<HTMLButtonElement | null>(null);
    const [qrOpen, setQrOpen] = useState(false);
    // navigator.share is undefined during SSR and on browsers without the
    // Web Share API (notably Firefox desktop, older Edge). We detect on mount
    // to avoid a hydration mismatch and skip rendering the button when it
    // wouldn't do anything. Also gated on a secure context — the API throws
    // a NotAllowedError on insecure origins, and we'd rather hide the button
    // than show a broken one.
    const [canNativeShare, setCanNativeShare] = useState(false);
    useEffect(() => {
        setCanNativeShare(
            typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.isSecureContext,
        );
    }, []);

    const parts = splitUrl(link);
    const isCopied = copyStatus === 'copied';

    async function handleNativeShare() {
        try {
            await navigator.share({ url: link, title: 'burnotes', text: t('shareNativeText') });
        } catch (err) {
            // AbortError = user dismissed the share sheet, which is normal
            // and shouldn't surface as a failure. Other errors (e.g. policy)
            // get logged so a dev catches regressions, but we don't toast —
            // the user has the visible Copy button right next door.
            if (err instanceof Error && err.name !== 'AbortError') {
                console.error('[burnotes] native share failed', err);
            }
        }
    }

    const readsLabel = maxReads === null ? '∞' : String(maxReads ?? 1);
    const passphraseLabel = hasPassphrase ? t('required') : t('none');

    return (
        <section className="card fade-up">
            <div className="card-body">
                <div className="link-box">
                    <div className="link-text">
                        <span className="scheme">{parts.scheme}</span>
                        <span className="host">{parts.host}</span>
                        <span className="path">{parts.path}</span>
                        <span className="frag">{parts.fragment}</span>
                    </div>
                    <button
                        ref={copyButtonRef}
                        type="button"
                        className={`copy-btn ${isCopied ? 'copied' : ''}`.trim()}
                        onClick={() =>
                            void copyText(link, {
                                successMessage: t('copied'),
                                errorMessage: tErrors('copyFailed'),
                            })
                        }
                        aria-label={isCopied ? t('copied') : t('copy')}
                    >
                        {isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        <span>{isCopied ? t('copied') : t('copy')}</span>
                    </button>
                    {canNativeShare ? (
                        <button
                            type="button"
                            className="share-btn"
                            onClick={() => void handleNativeShare()}
                            aria-label={t('shareNative')}
                            title={t('shareNative')}
                        >
                            <ShareIcon size={14} />
                            <span className="share-btn-label">{t('shareNative')}</span>
                        </button>
                    ) : null}
                </div>
                <ToastMessage toast={toast?.kind === 'error' ? toast : null} anchorRef={copyButtonRef} />
                <div className="banner banner-warn">
                    <EyeIcon size={16} className="icon" />
                    <span>
                        <strong>{t('warnTitle')}</strong> {t('warnBody')}
                    </span>
                </div>
                <div className="stats">
                    <div className="stat">
                        <div className="stat-label">
                            <ClockIcon size={12} /> {t('expiresIn')}
                        </div>
                        <div className="stat-value">
                            {expiresIn.value} {tUnits(expiresIn.unit)}
                        </div>
                    </div>
                    <div className="stat">
                        <div className="stat-label">
                            <EyeIcon size={12} /> {t('readsLeft')}
                        </div>
                        <div className="stat-value accent">{readsLabel}</div>
                    </div>
                    <div className="stat">
                        <div className="stat-label">
                            <KeyIcon size={12} /> {t('passphrase')}
                        </div>
                        <div className={`stat-value ${hasPassphrase ? 'accent' : ''}`.trim()}>{passphraseLabel}</div>
                    </div>
                </div>
            </div>
            <div className="card-footer">
                <button type="button" className="btn btn-secondary" onClick={onShareAnother}>
                    <PlusIcon size={14} /> {t('shareAnother')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setQrOpen(true)}>
                    <QrCodeIcon size={14} /> {t('qr')}
                </button>
                <button type="button" className="btn btn-danger" disabled aria-disabled="true">
                    <TrashIcon size={14} /> {t('burnNow')}
                </button>
            </div>
            <QrModal link={link} open={qrOpen} onClose={() => setQrOpen(false)} />
        </section>
    );
}
