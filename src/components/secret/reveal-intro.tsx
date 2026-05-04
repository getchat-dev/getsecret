'use client';

import { useTranslations } from 'next-intl';

type Props = {
    /** Reads still available before this open. `null` = unlimited (no maxViews cap). */
    readsRemaining: number | null;
};

/**
 * Heading + lede for /s/:id. Lives as a client component on this route
 * specifically so language switching from the picker (client-only on global
 * URLs without a locale segment) updates these texts in place, instead of
 * leaving the server-rendered English copy frozen on screen.
 *
 * Title and lede branch on the secret's reads policy so the recipient sees
 * the right expectation: a one-shot link reads as "one-time message", while
 * multi-read and unlimited links use neutral copy and explain how many
 * opens are left.
 */
export function RevealIntro({ readsRemaining }: Props) {
    const t = useTranslations('reveal');

    const titleKey = readsRemaining === 1 ? 'title' : 'titleMulti';
    const lede =
        readsRemaining === null
            ? t('ledeUnlimited')
            : readsRemaining > 1
              ? t('ledeMulti', { count: readsRemaining })
              : t('lede');

    return (
        <>
            <h1 className="display">{t(titleKey)}</h1>
            <p className="lede">{lede}</p>
        </>
    );
}
