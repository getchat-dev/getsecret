'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LightbulbIcon } from '@/components/ui/icons';
import { hintsEnabled, setHintsEnabled } from '@/lib/hints';
import styles from './hints-toggle.module.css';

// Header switch for the "?" hints on the create form. Like the theme switch,
// the pressed look comes from an attribute on <html> set before first paint
// (see src/lib/hints.ts), so it never jumps after hydration.
export function HintsToggle() {
    const t = useTranslations('hints');
    const [enabled, setEnabled] = useState<boolean | null>(null);

    useEffect(() => {
        setEnabled(hintsEnabled());
    }, []);

    function toggle() {
        const next = !hintsEnabled();
        setHintsEnabled(next);
        setEnabled(next);
    }

    const label = enabled === false ? t('show') : t('hide');
    return (
        <button
            type="button"
            className={styles.toggle}
            aria-pressed={enabled ?? undefined}
            aria-label={t('toggle')}
            title={label}
            onClick={toggle}
        >
            <LightbulbIcon size={14} />
        </button>
    );
}
