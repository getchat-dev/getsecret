// Server-side feature gates read from environment at request time.
// Defaults are intentionally conservative — features must be opted-in by
// setting the env var to 'true', so a fresh deploy of new code matches the
// behavior of the previous version until the operator flips the switch.

export function isMultiReadEnabled(): boolean {
    return process.env.MULTIREAD_ENABLED === 'true';
}

export function isPasswordEnabled(): boolean {
    return process.env.PASSWORD_PROTECTION_ENABLED === 'true';
}
