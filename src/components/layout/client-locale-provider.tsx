'use client';

import { NextIntlClientProvider } from 'next-intl';
import { type ComponentProps, createContext, useCallback, useContext, useState } from 'react';
import { type Locale, routing } from '@/i18n/routing';

type Messages = NonNullable<ComponentProps<typeof NextIntlClientProvider>['messages']>;

// Build a regex like `^\/(en|ru|de|...)(?=\/|$)` so we can detect & swap a locale
// segment in the URL without touching paths that don't have one (e.g. /s/:id).
const LOCALE_PREFIX_RE = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`);

type SwitchCtx = {
    locale: Locale;
    switchLocale: (next: Locale) => Promise<void>;
};

const Ctx = createContext<SwitchCtx | null>(null);

const messageLoaders: Record<Locale, () => Promise<{ default: Messages }>> = {
    en: () => import('@/i18n/messages/en.json'),
    ru: () => import('@/i18n/messages/ru.json'),
};

type Props = {
    initialLocale: Locale;
    initialMessages: Messages;
    children: React.ReactNode;
};

export function ClientLocaleProvider({ initialLocale, initialMessages, children }: Props) {
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [messages, setMessages] = useState<Messages>(initialMessages);

    const switchLocale = useCallback(
        async (next: Locale) => {
            if (next === locale) return;
            const mod = await messageLoaders[next]();
            setMessages(mod.default);
            setLocale(next);

            if (typeof window !== 'undefined') {
                const { pathname, search, hash } = window.location;
                // Only rewrite the URL when the current path actually carries a locale
                // segment. Pages like /s/:id are global — leave their URL untouched.
                if (LOCALE_PREFIX_RE.test(pathname)) {
                    const newPath = pathname.replace(LOCALE_PREFIX_RE, `/${next}`);
                    window.history.replaceState(null, '', newPath + search + hash);
                }
                document.documentElement.lang = next;
            }
        },
        [locale],
    );

    return (
        <Ctx.Provider value={{ locale, switchLocale }}>
            <NextIntlClientProvider locale={locale} messages={messages}>
                {children}
            </NextIntlClientProvider>
        </Ctx.Provider>
    );
}

export function useSwitchLocale() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useSwitchLocale must be used inside ClientLocaleProvider');
    return ctx.switchLocale;
}
