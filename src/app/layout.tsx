// Root layout. Renders nothing on its own; html/body live in [locale]/layout.tsx
// so the language attribute can match the active locale.
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return children;
}
