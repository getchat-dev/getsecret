import { type Locale, routing } from './routing';

// Client-side URL helpers for the language switcher. Routing is 'as-needed', so
// "does the URL carry a locale segment" no longer tells a localized page from a
// global one: English pages (`/`, `/faq`) have no prefix at all.

const LOCALE_PREFIX_RE = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`);

// Routes outside [locale] — the secret viewer and the API — keep their URL on a
// language switch. Mirrors the bypass in proxy.ts.
export function isLocalizedPath(pathname: string): boolean {
    return !pathname.startsWith('/s/') && !pathname.startsWith('/api/');
}

export function stripLocalePrefix(pathname: string): string {
    return pathname.replace(LOCALE_PREFIX_RE, '') || '/';
}

// `/ru/faq` + en → `/faq`; `/` + ru → `/ru`.
export function pathForLocale(pathname: string, locale: Locale): string {
    const rest = stripLocalePrefix(pathname);
    if (locale === routing.defaultLocale) return rest;
    return rest === '/' ? `/${locale}` : `/${locale}${rest}`;
}

// Records the user's language choice after a soft switch, which changes the URL
// with history.replaceState and so never reaches the middleware. Name and
// attributes copy next-intl's defaults (routing.localeCookie is unset): if that
// gets configured in routing.ts, update this to match or the two cookies diverge.
export function writeLocaleCookie(locale: Locale): void {
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is async and missing in older Safari/Firefox.
    document.cookie = `NEXT_LOCALE=${locale}; path=/; SameSite=Lax`;
}
