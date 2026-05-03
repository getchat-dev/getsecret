'use client';

import { useTranslations } from 'next-intl';

/**
 * Eyebrow + heading + lede for /s/:id. Lives as a client component on this
 * route specifically so language switching from the picker (which is client
 * only on global URLs without a locale segment) updates these texts in place,
 * instead of leaving the server-rendered English copy frozen on screen.
 */
export function RevealIntro() {
    const t = useTranslations('reveal');
    const tEyebrow = useTranslations('eyebrow');
    return (
        <>
            <span className="eyebrow">
                <span className="ember-dot" />
                {tEyebrow('reveal')}
            </span>
            <h1 className="display">{t('title')}</h1>
            <p className="lede">{t('lede')}</p>
        </>
    );
}
