'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { EyeIcon, EyeOffIcon, FlameIcon, PlusIcon } from '@/components/ui/icons';
import { useRouter } from '@/i18n/navigation';
import type { SecretFormat } from '@/lib/secret-formats';

type Props = {
    content: string;
    format: SecretFormat;
    viewsRemaining: number | null;
};

export function RevealedSecret({ content, format, viewsRemaining }: Props) {
    const t = useTranslations('revealed');
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
                const { highlight } = await import('@/lib/highlight-secret');
                if (!cancelled) setHighlightedHtml(highlight(content, format));
            } catch {
                if (!cancelled) setHighlightedHtml('');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [content, format]);

    const showHighlighted = format !== 'plain' && highlightedHtml !== null && highlightedHtml.length > 0;

    return (
        <section className="card fade-up">
            <header className="card-header">
                <span className="card-header-title">{t('plaintext')}</span>
                <span className="card-header-meta">
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
                        errorMessage={t('copyClip')}
                    />
                </span>
            </header>
            <div className="card-body">
                <div className="secret-output">
                    <pre className={`secret-output-content ${hidden ? 'masked' : ''}`.trim()}>
                        {showHighlighted ? (
                            <code
                                className={`hljs language-${format}`}
                                // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes content; only span tags are injected.
                                dangerouslySetInnerHTML={{ __html: highlightedHtml as string }}
                            />
                        ) : (
                            content
                        )}
                    </pre>
                </div>
                <div className="banner banner-success">
                    <FlameIcon size={16} className="icon" />
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
                <CopyButton
                    textToCopy={content}
                    copyLabel={t('copyClip')}
                    copiedLabel={t('copyClip')}
                    successMessage={t('copiedToast')}
                    errorMessage={t('copyClip')}
                />
                <button type="button" className="btn btn-secondary" onClick={() => router.push('/')}>
                    <PlusIcon size={14} /> {t('shareBack')}
                </button>
                <span className="card-footer-note">{t('footnote')}</span>
            </footer>
        </section>
    );
}
