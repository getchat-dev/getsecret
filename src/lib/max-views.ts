export const MAX_VIEW_PRESETS = [1, 3, 5, 10] as const;

export type MaxViewsPreset = (typeof MAX_VIEW_PRESETS)[number];

export const MAX_VIEWS_HARD_CAP = 10;

export const DEFAULT_MAX_VIEWS: MaxViewsPreset = 1;

export function isValidMaxViews(value: unknown): value is number | null {
    if (value === null) return true;
    if (typeof value !== 'number') return false;
    if (!Number.isInteger(value)) return false;
    return value >= 1 && value <= MAX_VIEWS_HARD_CAP;
}
