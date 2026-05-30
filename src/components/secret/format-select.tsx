'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from '@/components/ui/icons';
import {
    SECRET_FORMAT_EXTENSIONS,
    SECRET_FORMAT_LABELS,
    SECRET_FORMATS,
    type SecretFormat,
} from '@/lib/secret-formats';
import styles from './format-select.module.css';

type Props = {
    value: SecretFormat;
    onChange: (next: SecretFormat) => void;
    label?: string;
};

export function FormatSelect({ value, onChange, label }: Props) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(event: MouseEvent) {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        function handleKey(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open]);

    const ext = SECRET_FORMAT_EXTENSIONS[value];

    return (
        <div ref={containerRef} className={styles.wrap}>
            <button
                type="button"
                className={styles.trigger}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={label}
                onClick={() => setOpen((prev) => !prev)}
            >
                <span className={styles.label}>{SECRET_FORMAT_LABELS[value]}</span>
                <span className={styles.ext}>.{ext}</span>
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`${styles.chevron} ${open ? styles.open : ''}`.trim()}
                    aria-hidden="true"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {open ? (
                <div role="listbox" className={styles.menu}>
                    {SECRET_FORMATS.map((id) => {
                        const isActive = id === value;
                        return (
                            <button
                                key={id}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                className={`${styles.option} ${isActive ? styles.active : ''}`.trim()}
                                onClick={() => {
                                    onChange(id);
                                    setOpen(false);
                                }}
                            >
                                <span className={styles.optionLabel}>{SECRET_FORMAT_LABELS[id]}</span>
                                <span className={styles.optionExt}>.{SECRET_FORMAT_EXTENSIONS[id]}</span>
                                {isActive ? <CheckIcon size={12} /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
