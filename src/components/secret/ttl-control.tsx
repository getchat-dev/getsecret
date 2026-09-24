'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Hint } from '@/components/ui/hint';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';
import { maxValueForUnit, TTL_UNITS, type TtlUnit, unitSeconds } from '@/lib/expiration';
import controls from '@/styles/primitives/controls.module.css';
import field from '@/styles/primitives/field.module.css';

type Props = {
    value: string;
    unit: TtlUnit;
    onChange: (next: { value: string; unit: TtlUnit }) => void;
};

// Unit-label tiers, widest → narrowest. The stepper and the unit buttons share one
// shell that cannot wrap, so the control measures itself and drops to a shorter tier
// when the full names would push that shell past the width of its line:
//   full → "minutes / hours / days" (count-aware: minute vs minutes)
//   mid  → "min / hr / day"
//   short→ "m / h / d"
const TIERS = ['full', 'mid', 'short'] as const;
type Tier = (typeof TIERS)[number];

// useLayoutEffect warns during SSR; this client component still server-renders,
// so fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function TtlControl({ value, unit, onChange }: Props) {
    const t = useTranslations('create');
    const tUnits = useTranslations('create.units');
    const tHints = useTranslations('hints');
    const locale = useLocale();

    const max = maxValueForUnit(unit);
    const parsed = Number.parseInt(value, 10);
    const numeric = Number.isInteger(parsed) ? parsed : null;
    // Drives singular/plural on the labels ("1 day" vs "2 days"); empty/invalid
    // input reads as 1 so the labels stay singular while mid-typing.
    const count = numeric ?? 1;

    const rowRef = useRef<HTMLDivElement>(null);
    const groupRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [tierIndex, setTierIndex] = useState(0);
    const lastInputs = useRef('');

    // Re-measure whenever our own width changes.
    useEffect(() => {
        const row = rowRef.current;
        if (!row || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver((entries) => {
            const width = Math.round(entries[0].contentRect.width);
            setContainerWidth((prev) => (prev === width ? prev : width));
        });
        observer.observe(row);
        return () => observer.disconnect();
    }, []);

    // Fit search: when the inputs (available width, count, locale) change, restart
    // from the widest tier; otherwise, if the group is wider than the line it sits
    // on, drop one tier. Runs before paint so no intermediate tier flashes.
    // The group never wraps and never shrinks (controls.inputGroup is flex: 0 0 auto),
    // so its offsetWidth is the width the current labels actually want. The TTL field
    // grows to fill its line (see field.grow), so the available width is independent
    // of the tier — no measure → shrink → re-measure feedback loop.
    useIsoLayoutEffect(() => {
        const group = groupRef.current;
        const row = rowRef.current;
        if (!group || !row) return;

        const key = `${containerWidth}|${count}|${locale}`;
        if (lastInputs.current !== key) {
            lastInputs.current = key;
            if (tierIndex !== 0) {
                setTierIndex(0);
                return;
            }
        }

        if (group.offsetWidth > row.clientWidth + 1 && tierIndex < TIERS.length - 1) {
            setTierIndex(tierIndex + 1);
        }
    }, [containerWidth, count, locale, tierIndex]);

    const tier: Tier = TIERS[tierIndex];
    // mid/short messages carry no {count} placeholder, so the value is ignored there.
    const label = (option: TtlUnit, forTier: Tier = tier) => tUnits(`${option}.${forTier}`, { count });

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
        <div className={`${field.field} ${field.grow}`}>
            <div className={field.labelRow}>
                <label className={field.label} htmlFor="ttl-value">
                    {t('expiresIn')}
                </label>
                <Hint label={t('expiresIn')}>{tHints('expiresIn')}</Hint>
            </div>
            <div className={field.row} ref={rowRef}>
                {/* Stepper and unit choice share one shell so they read as a single
                    field — "1 day" — rather than two unrelated controls. */}
                <div className={controls.inputGroup} ref={groupRef}>
                    <div className={controls.stepper}>
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
                            aria-label={`${t('expiresIn')} (${label(unit, 'full')})`}
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
                    <div className={controls.segmented}>
                        {TTL_UNITS.map((option) => (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={option === unit}
                                // Always announce the full word to screen readers, even when
                                // the visible label is abbreviated to "m" / "h" / "d".
                                aria-label={label(option, 'full')}
                                onClick={() => setUnit(option)}
                            >
                                {label(option)}
                            </button>
                        ))}
                    </div>
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
