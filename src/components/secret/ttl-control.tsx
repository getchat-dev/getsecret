'use client';

import { useTranslations } from 'next-intl';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';
import { maxValueForUnit, TTL_UNITS, type TtlUnit, unitSeconds } from '@/lib/expiration';

type Props = {
    value: string;
    unit: TtlUnit;
    onChange: (next: { value: string; unit: TtlUnit }) => void;
};

export function TtlControl({ value, unit, onChange }: Props) {
    const t = useTranslations('create');
    const tUnits = useTranslations('create.units');

    const max = maxValueForUnit(unit);
    const parsed = Number.parseInt(value, 10);
    const numeric = Number.isInteger(parsed) ? parsed : null;

    function setValue(next: string) {
        const digitsOnly = next.replace(/\D+/g, '');
        onChange({ value: digitsOnly, unit });
    }

    function setUnit(next: TtlUnit) {
        if (next === unit) return;
        const nextMax = maxValueForUnit(next);
        const clampedValue = numeric !== null && numeric > nextMax ? String(nextMax) : value;
        onChange({ value: clampedValue, unit: next });
    }

    function step(delta: number) {
        const base = numeric ?? 1;
        const next = Math.min(max, Math.max(1, base + delta));
        onChange({ value: String(next), unit });
    }

    return (
        <div className="field">
            <label className="field-label" htmlFor="ttl-value">
                {t('expiresIn')}
            </label>
            <div className="field-row">
                <div className="stepper">
                    <button
                        type="button"
                        onClick={() => step(-1)}
                        disabled={numeric !== null && numeric <= 1}
                        aria-label="Decrease"
                    >
                        <MinusIcon size={12} />
                    </button>
                    <input
                        id="ttl-value"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        aria-label={`${t('expiresIn')} (${tUnits(unit)})`}
                    />
                    <button
                        type="button"
                        onClick={() => step(1)}
                        disabled={numeric !== null && numeric >= max}
                        aria-label="Increase"
                    >
                        <PlusIcon size={12} />
                    </button>
                </div>
                <div className="segmented">
                    {TTL_UNITS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={option === unit}
                            onClick={() => setUnit(option)}
                        >
                            {tUnits(option)}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function ttlValueToSeconds(value: string, unit: TtlUnit): number | null {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxValueForUnit(unit)) {
        return null;
    }
    return parsed * unitSeconds(unit);
}
