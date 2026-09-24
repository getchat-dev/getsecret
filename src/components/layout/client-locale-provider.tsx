'use client';

import { NextIntlClientProvider } from 'next-intl';
import { type ComponentProps, createContext, useCallback, useContext, useState } from 'react';
import { isLocalizedPath, pathForLocale, writeLocaleCookie } from '@/i18n/locale-path';
import type { Locale } from '@/i18n/routing';
import { localeDirection } from '@/lib/locale-direction';

type Messages = NonNullable<ComponentProps<typeof NextIntlClientProvider>['messages']>;

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
                // Pages like /s/:id are global: their URL has no locale to swap, and
                // their language comes from Accept-Language alone, so no cookie either.
                // On localized pages the cookie is what keeps the choice across a
                // reload — without it, `/` sends a Russian browser back to `/ru`.
                if (isLocalizedPath(pathname)) {
                    window.history.replaceState(null, '', pathForLocale(pathname, next) + search + hash);
                    writeLocaleCookie(next);
                }
                document.documentElement.lang = next;
                // Keep dir in step with the locale so the mobile push-drawer (and
                // any RTL layout) flips sides on a soft switch, matching SSR.
                document.documentElement.dir = localeDirection(next);
            }
        },
        [locale],
    );

    return (
        <Ctx.Provider value={{ locale, switchLocale }}>
            <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
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
