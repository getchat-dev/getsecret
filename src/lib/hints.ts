// Field hints on the create form: the "?" next to each control. On by default;
// the header lightbulb turns them off. The choice lives in localStorage and is
// mirrored onto <html data-hints="off"> by the pre-hydration script in the root
// layouts, so hidden hints never flash in on first paint. CSS keys off the
// attribute alone — no React state has to agree with it.
export const HINTS_STORAGE_KEY = 'hints';
export const HINTS_ATTRIBUTE = 'data-hints';

export function hintsEnabled(): boolean {
    return document.documentElement.getAttribute(HINTS_ATTRIBUTE) !== 'off';
}

export function setHintsEnabled(enabled: boolean) {
    if (enabled) {
        document.documentElement.removeAttribute(HINTS_ATTRIBUTE);
    } else {
        document.documentElement.setAttribute(HINTS_ATTRIBUTE, 'off');
    }
    try {
        if (enabled) {
            window.localStorage.removeItem(HINTS_STORAGE_KEY);
        } else {
            window.localStorage.setItem(HINTS_STORAGE_KEY, 'off');
        }
    } catch {
        // Storage blocked (private mode, disabled cookies): the toggle still
        // works for this page view, it just won't be remembered.
    }
}
