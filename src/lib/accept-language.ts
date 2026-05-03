import { hasLocale } from 'next-intl';
import { type Locale, routing } from '@/i18n/routing';

/**
 * Pick the best supported locale from a browser-sent `Accept-Language` header.
 * The header is parsed by token (commas), each token's quality factor is dropped,
 * and the first matching locale wins (region fallbacks: `ru-RU` → `ru`).
 * Returns `routing.defaultLocale` when nothing matches or the header is missing.
 */
export function pickLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
    if (!header) return routing.defaultLocale;
    const tags = header
        .split(',')
        .map((part) => part.trim().split(';')[0]?.toLowerCase() ?? '')
        .filter(Boolean);
    for (const tag of tags) {
        if (hasLocale(routing.locales, tag)) return tag;
        const base = tag.split('-')[0];
        if (hasLocale(routing.locales, base)) return base;
    }
    return routing.defaultLocale;
}
