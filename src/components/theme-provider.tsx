'use client';

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, nonce, ...props }: ThemeProviderProps & { nonce?: string }) {
    return (
        <NextThemesProvider
            attribute="data-theme"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            nonce={nonce}
            {...props}
        >
            {children}
        </NextThemesProvider>
    );
}
