'use client';

import { useTranslations } from 'next-intl';

/**
 * Eyebrow + heading + lede for the home page. Lives as a client component so
 * language switching there can stay client-only — preserving CreateForm state
 * and avoiding the route-change animation replay on every locale flip.
 */
export function CreateIntro() {
    const t = useTranslations('create');
    const tEyebrow = useTranslations('eyebrow');
    return (
        <>
            <span className="eyebrow">
                <span className="ember-dot" />
                {tEyebrow('create')}
            </span>
            <h1 className="display">
                {t('title1')} <span className="accent-word">{t('title2')}</span>
            </h1>
            <p className="lede">{t('lede')}</p>
        </>
    );
}
