import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale;
    const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

    return {
        locale,
        // Pin a fixed time zone so server-rendered markup matches the client one.
        // Burnotes only formats durations (link TTL), not dates, so UTC is fine.
        timeZone: 'UTC',
        messages: (await import(`./messages/${locale}.json`)).default,
    };
});
