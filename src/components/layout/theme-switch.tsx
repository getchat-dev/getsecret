'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const ICONS = {
    system: (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <rect x="2" y="4" width="20" height="14" rx="2" />
            <line x1="8" y1="20" x2="16" y2="20" />
            <line x1="12" y1="18" x2="12" y2="20" />
        </svg>
    ),
    light: (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
    ),
    dark: (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    ),
} as const;

export function ThemeSwitch() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Render placeholder until client mounts so SSR/CSR markup matches.
    const active = mounted ? (theme ?? 'system') : 'system';

    return (
        <fieldset className="theme-switch">
            <legend className="visually-hidden">Theme</legend>
            {(['system', 'light', 'dark'] as const).map((option) => (
                <button
                    key={option}
                    type="button"
                    className={active === option ? 'active' : ''}
                    aria-pressed={active === option}
                    aria-label={option}
                    onClick={() => setTheme(option)}
                >
                    {ICONS[option]}
                </button>
            ))}
        </fieldset>
    );
}
