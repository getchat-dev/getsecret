'use client';

import { useTranslations } from 'next-intl';
import { MAX_VIEW_PRESETS } from '@/lib/max-views';

type Props = {
    value: number | null;
    onChange: (next: number | null) => void;
};

export function MaxViewsControl({ value, onChange }: Props) {
    const t = useTranslations('create');

    const options: Array<{ id: string; label: string; value: number | null }> = [
        ...MAX_VIEW_PRESETS.map((preset) => ({
            id: String(preset),
            label: String(preset),
            value: preset as number | null,
        })),
        { id: 'unlimited', label: '∞', value: null },
    ];

    return (
        <div className="field">
            <span className="field-label">{t('maxReads')}</span>
            <div className="field-row">
                <div className="segmented">
                    {options.map((option) => {
                        const pressed = option.value === value;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                aria-pressed={pressed}
                                onClick={() => onChange(option.value)}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
