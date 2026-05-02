'use client';

import { useTranslations } from 'next-intl';
import { useClipboardCopy } from '@/components/copy-button';
import {
    CheckIcon,
    ClockIcon,
    CopyIcon,
    EyeIcon,
    KeyIcon,
    PlusIcon,
    QrCodeIcon,
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
    const tCreate = useTranslations('create');
    const tUnits = useTranslations('create.units');
    const { copyStatus, copyText } = useClipboardCopy();

    const parts = splitUrl(link);
    const isCopied = copyStatus === 'copied';

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
                        type="button"
                        className={`copy-btn ${isCopied ? 'copied' : ''}`.trim()}
                        onClick={() =>
                            void copyText(link, {
                                successMessage: t('copied'),
                                errorMessage: tCreate('formatLabel'),
                            })
                        }
                        aria-label={isCopied ? t('copied') : t('copy')}
                    >
                        {isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        <span>{isCopied ? t('copied') : t('copy')}</span>
                    </button>
                </div>
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
                <button type="button" className="btn btn-ghost" disabled aria-disabled="true">
                    <QrCodeIcon size={14} /> {t('qr')}
                </button>
                <button type="button" className="btn btn-danger" disabled aria-disabled="true">
                    <TrashIcon size={14} /> {t('burnNow')}
                </button>
            </div>
        </section>
    );
}
