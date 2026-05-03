'use client';

import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useSwitchLocale } from '@/components/layout/client-locale-provider';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale, routing } from '@/i18n/routing';

const LOCALE_PREFIX_RE = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`);

type LocaleMeta = {
    code: Locale;
    label: string;
    flag: string;
};

// Hard-coded per-locale labels mirroring new_design/i18n.jsx so we can render
// them without bundling all 7 message JSONs into the client.
const LOCALE_META: Record<Locale, LocaleMeta> = {
    en: { code: 'en', label: 'English', flag: '🇬🇧' },
    zh: { code: 'zh', label: '中文', flag: '🇨🇳' },
    ru: { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    es: { code: 'es', label: 'Español', flag: '🇪🇸' },
    it: { code: 'it', label: 'Italiano', flag: '🇮🇹' },
    de: { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    fr: { code: 'fr', label: 'Français', flag: '🇫🇷' },
};

export function LangPicker() {
    const locale = useLocale() as Locale;
    const switchLocale = useSwitchLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(event: MouseEvent) {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        function handleKey(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        window.addEventListener('mousedown', handleClick);
        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('mousedown', handleClick);
            window.removeEventListener('keydown', handleKey);
        };
    }, [open]);

    const current = LOCALE_META[locale] ?? LOCALE_META.en;

    function selectLocale(next: Locale) {
        setOpen(false);
        if (next === locale) return;
        // Decide between a real route change (server re-render, blows away client
        // state) and an in-place context swap based on whether the current page
        // has stateful client UI we'd rather not throw away. The home page (form
        // with input/animations) and global routes like /s/:id stay client-only;
        // static localized pages (docs/faq/...) get a soft route change so their
        // server-rendered text actually retranslates.
        const fullPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const localeMatch = fullPath.match(LOCALE_PREFIX_RE);
        const restAfterLocale = localeMatch ? fullPath.slice(localeMatch[0].length) : null;
        const isHome = restAfterLocale === '' || restAfterLocale === '/';
        if (localeMatch && !isHome) {
            router.replace(pathname, { locale: next });
        } else {
            void switchLocale(next);
        }
    }

    return (
        <div ref={containerRef} className="lang-picker">
            <button
                type="button"
                className="lang-picker-trigger"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((prev) => !prev)}
            >
                <span className="flag" aria-hidden="true">
                    {current.flag}
                </span>
                <span>{current.code.toUpperCase()}</span>
            </button>
            {open ? (
                <div role="listbox" className="lang-picker-menu">
                    {routing.locales.map((code) => {
                        const meta = LOCALE_META[code];
                        const isActive = code === locale;
                        return (
                            <button
                                key={code}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                className={`lang-picker-option ${isActive ? 'active' : ''}`.trim()}
                                onClick={() => selectLocale(code)}
                            >
                                <span className="flag" aria-hidden="true">
                                    {meta.flag}
                                </span>
                                <span>{meta.label}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
