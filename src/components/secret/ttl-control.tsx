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
        // 1. Strip non-digits (keeps the field numeric even if the user
        //    pastes "1d", spaces, etc.).
        // 2. Strip leading zeros — `0000` would otherwise render verbatim
        //    and confuse the recipient into thinking they picked a real TTL.
        //    Keep a lone "0" so mid-typing ("0" → "07" → "7") stays smooth;
        //    a final "0" still fails ttlValueToSeconds at submit time.
        // 3. Clamp to the unit's max — typing `9999 days` shouldn't be
        //    visible if the server is going to refuse it anyway. Lets the
        //    stepper's `numeric >= max` disabled state stay honest.
        let digits = next.replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
        if (digits.length > 0) {
            const parsedNext = Number.parseInt(digits, 10);
            if (Number.isInteger(parsedNext) && parsedNext > max) digits = String(max);
        }
        onChange({ value: digits, unit });
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
