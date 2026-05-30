// Maps a locale tag to its writing direction. Only en/ru ship today (both LTR),
// but the mobile drawer and any future RTL locale (ar/he/fa/…) read `dir` off
// <html>, so wiring this in now means the push-drawer flips sides automatically
// the day an RTL language is enabled — no component changes required.
const RTL_BASE_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'dv', 'syr', 'yi', 'ku']);

export type Direction = 'ltr' | 'rtl';

export function localeDirection(locale: string): Direction {
    const base = locale.toLowerCase().split('-')[0];
    return RTL_BASE_LANGUAGES.has(base) ? 'rtl' : 'ltr';
}
