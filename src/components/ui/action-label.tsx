'use client';

import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';
import { usesCommandTokens } from '@/lib/ui-commands';
import btn from '@/styles/primitives/button.module.css';

type Props = {
    command: string;
    children: ReactNode;
};

// The label of a button that carries one of the product's own verbs. English
// gets the snake_case token; every other locale gets the translated phrase
// passed as children.
//
// The token is the accessible name too, not a decorative layer over a hidden
// translation. In English both would be English, and a voice-control user
// saying what they see — "create secret" — would miss a button whose
// accessible name read "Encrypt & generate link". Locales that never see the
// token lose nothing, because they get the translated phrase as their label.
export function ActionLabel({ command, children }: Props) {
    const locale = useLocale();
    if (!usesCommandTokens(locale)) {
        return <>{children}</>;
    }
    return <span className={btn.command}>{command}</span>;
}

// Same choice, for a button whose label is not visible — an icon-only control
// that needs `aria-label` to have a name at all. Keeping it on the same rule
// stops the name and the visible token from disagreeing at the widths where
// the label does show.
export function useActionLabel(): (command: string, translated: string) => string {
    const locale = useLocale();
    return (command, translated) => (usesCommandTokens(locale) ? command : translated);
}
