export const MIN_PASSWORD_LENGTH = 8;
// 100 is plenty for any strong passphrase (Diceware 7-word ≈ 30, 12-word ≈ 60).
// We deliberately cap below 256 so a stray paste of a whole document into the
// password field gets rejected at the input boundary instead of going to
// PBKDF2 (fixed cost regardless of length, but defense-in-depth).
export const MAX_PASSWORD_LENGTH = 100;

export function isValidPassword(value: string): boolean {
    if (typeof value !== 'string') return false;
    if (value.length < MIN_PASSWORD_LENGTH) return false;
    if (value.length > MAX_PASSWORD_LENGTH) return false;
    return value.trim().length > 0;
}
