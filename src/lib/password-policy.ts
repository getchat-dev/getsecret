export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

export function isValidPassword(value: string): boolean {
    if (typeof value !== 'string') return false;
    if (value.length < MIN_PASSWORD_LENGTH) return false;
    if (value.length > MAX_PASSWORD_LENGTH) return false;
    return value.trim().length > 0;
}
