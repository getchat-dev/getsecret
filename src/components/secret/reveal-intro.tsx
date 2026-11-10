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
 * The title is the same for every link: it credits the sender for keeping
 * the secret out of the chat. The lede branches on the reads policy so the
 * recipient knows what opening does: the last (or only) read burns it,
 * multi-read links say how many opens are left, unlimited ones run until
 * expiry.
 */
export function RevealIntro({ readsRemaining }: Props) {
    const t = useTranslations('reveal');

    const lede =
        readsRemaining === null
            ? t('ledeUnlimited')
            : readsRemaining > 1
              ? t('ledeMulti', { count: readsRemaining })
              : t('lede');

    return (
        <>
            <h1 className="display">{t('title')}</h1>
            <p className="lede">{lede}</p>
        </>
    );
}
