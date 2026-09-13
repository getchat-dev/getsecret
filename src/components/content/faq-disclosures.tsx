'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import btn from '@/styles/primitives/button.module.css';

// Wraps the FAQ's server-rendered MDX and adds one control over it. The
// <details> elements themselves come from mdx/rehype-faq-details.mjs and work
// on their own — this only drives them in bulk, so the page still opens and
// closes normally if the script never loads.
export function FaqDisclosures({ children }: { children: React.ReactNode }) {
    const t = useTranslations('faq');
    const listRef = useRef<HTMLDivElement>(null);
    const [allOpen, setAllOpen] = useState(false);

    const items = useCallback(() => Array.from(listRef.current?.querySelectorAll('details') ?? []), []);

    // The label has to stay honest when rows are opened one by one, so it
    // follows the actual state rather than the last button press. `toggle`
    // doesn't bubble, hence the capture phase.
    useEffect(() => {
        const node = listRef.current;
        if (!node) return;
        const sync = () => {
            const all = Array.from(node.querySelectorAll('details'));
            setAllOpen(all.length > 0 && all.every((item) => item.open));
        };
        sync();
        node.addEventListener('toggle', sync, true);
        return () => node.removeEventListener('toggle', sync, true);
    }, []);

    function toggleAll() {
        const next = !allOpen;
        for (const item of items()) item.open = next;
        setAllOpen(next);
    }

    return (
        <>
            <div className="faq-toolbar">
                <button type="button" className={`${btn.btn} ${btn.btnGhost}`} onClick={toggleAll}>
                    {allOpen ? t('collapseAll') : t('expandAll')}
                </button>
            </div>
            <div className="faq-list" ref={listRef}>
                {children}
            </div>
        </>
    );
}
