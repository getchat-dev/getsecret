export const MIN_EXPIRATION_SECONDS = 1;
export const MAX_EXPIRATION_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_EXPIRATION_SECONDS = 24 * 60 * 60;

export function isValidExpirationSeconds(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_EXPIRATION_SECONDS &&
        value <= MAX_EXPIRATION_SECONDS
    );
}

export const TTL_UNITS = ['minutes', 'hours', 'days'] as const;
export type TtlUnit = (typeof TTL_UNITS)[number];

const SECONDS_PER_UNIT: Record<TtlUnit, number> = {
    minutes: 60,
    hours: 3600,
    days: 86_400,
};

export function unitSeconds(unit: TtlUnit): number {
    return SECONDS_PER_UNIT[unit];
}

export function maxValueForUnit(unit: TtlUnit): number {
    return Math.floor(MAX_EXPIRATION_SECONDS / unitSeconds(unit));
}
