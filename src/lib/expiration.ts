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
