'use client';

import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { LangPicker } from '@/components/layout/lang-picker';
import { ThemeSwitch } from '@/components/layout/theme-switch';
import { XIcon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';
import styles from './nav-shell.module.css';

// Keep this in lockstep with --nav-anim in globals.css: the close sequence waits
// this long for the panel to finish sliding out before it releases the scroll
// lock. (Under reduced-motion we skip the wait entirely — see closeMenu.)
const ANIM_MS = 280;
const MOBILE_QUERY = '(max-width: 640px)';
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type NavContext = {
    open: boolean;
    toggle: () => void;
    close: () => void;
    triggerId: string;
    panelId: string;
    registerTrigger: (el: HTMLButtonElement | null) => void;
};

const Ctx = createContext<NavContext | null>(null);

/** Read by the hamburger trigger in <SiteHeader>. Must be used inside <NavShell>. */
export function useMobileNav() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useMobileNav must be used within <NavShell>');
    return ctx;
}

function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia(MOTION_QUERY).matches;
}

type NavShellProps = {
    header: React.ReactNode;
    footer: React.ReactNode;
    children: React.ReactNode;
};

/**
 * Off-canvas "push" drawer for mobile. The page shell ({header}, page, {footer})
 * lives in a single transformable box; the drawer is its sibling, pinned to the
 * inline-end edge and parked off-canvas. Opening slides BOTH in lockstep so the
 * panel appears to occupy the space the page vacates — it never draws on top.
 *
 * Direction is fully CSS-driven (`--nav-x` flips under `[dir="rtl"]`), so the
 * panel enters from the right in LTR and from the left in RTL with no JS branch.
 */
export function NavShell({ header, footer, children }: NavShellProps) {
    const t = useTranslations('nav');
    const tTheme = useTranslations('theme');
    const [open, setOpen] = useState(false);

    const drawerRef = useRef<HTMLElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const closeTimer = useRef<number | null>(null);
    const rafId = useRef<number | null>(null);
    // Guards the focus-return effect from firing on the initial (never-opened)
    // render, which would otherwise yank focus to the trigger on page load.
    const everOpened = useRef(false);

    const reactId = useId();
    const panelId = `nav-panel-${reactId}`;
    const triggerId = `nav-trigger-${reactId}`;

    const clearTimers = useCallback(() => {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
        if (rafId.current !== null) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
        }
    }, []);

    // overflow:hidden keeps the current scroll offset (unlike the position:fixed
    // trick, which jumps to the top), so the page can't jitter while the drawer
    // is open. We also pad for the scrollbar width so the content doesn't lurch
    // sideways the instant the bar disappears.
    const lockScroll = useCallback(() => {
        const root = document.documentElement;
        const scrollbar = window.innerWidth - root.clientWidth;
        if (scrollbar > 0) root.style.setProperty('--nav-scrollbar', `${scrollbar}px`);
        root.classList.add('nav-locked');
    }, []);

    const unlockScroll = useCallback(() => {
        const root = document.documentElement;
        root.classList.remove('nav-locked');
        root.style.removeProperty('--nav-scrollbar');
    }, []);

    const openMenu = useCallback(() => {
        clearTimers();
        everOpened.current = true;
        // 1) Freeze the page FIRST so it can't move, then start the slide.
        lockScroll();
        if (prefersReducedMotion()) {
            setOpen(true);
            return;
        }
        // Let the lock + the closed transform commit across two frames before we
        // flip to the open state, so the browser actually animates the change
        // instead of collapsing both into one paint.
        rafId.current = requestAnimationFrame(() => {
            rafId.current = requestAnimationFrame(() => setOpen(true));
        });
    }, [clearTimers, lockScroll]);

    const closeMenu = useCallback(() => {
        clearTimers();
        setOpen(false);
        // 2) Let the panel slide back to where it came from, THEN drop the lock.
        if (prefersReducedMotion()) {
            unlockScroll();
            return;
        }
        closeTimer.current = window.setTimeout(unlockScroll, ANIM_MS + 40);
    }, [clearTimers, unlockScroll]);

    const toggle = useCallback(() => {
        if (open) closeMenu();
        else openMenu();
    }, [open, openMenu, closeMenu]);

    const registerTrigger = useCallback((el: HTMLButtonElement | null) => {
        triggerRef.current = el;
    }, []);

    // Move focus into the panel on open; hand it back to the trigger on close.
    useEffect(() => {
        if (open) {
            drawerRef.current?.querySelector<HTMLElement>('[data-nav-autofocus]')?.focus();
        } else if (everOpened.current) {
            triggerRef.current?.focus();
        }
    }, [open]);

    // Escape closes. Live edges: if the viewport grows past the mobile breakpoint
    // while open, close so we never strand a locked page on desktop.
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMenu();
        };
        const mq = window.matchMedia(MOBILE_QUERY);
        const onViewportChange = () => {
            if (!mq.matches) closeMenu();
        };
        window.addEventListener('keydown', onKeyDown);
        mq.addEventListener('change', onViewportChange);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            mq.removeEventListener('change', onViewportChange);
        };
    }, [open, closeMenu]);

    // Safety net: never leave the document scroll-locked if we unmount mid-open.
    useEffect(() => {
        return () => {
            clearTimers();
            unlockScroll();
        };
    }, [clearTimers, unlockScroll]);

    return (
        <Ctx.Provider value={{ open, toggle, close: closeMenu, triggerId, panelId, registerTrigger }}>
            {/* Decorative grid stays put as a stable backdrop while the shell slides over it. */}
            <div className="bg-grid" aria-hidden="true" />

            <div className={`${styles.shell} ${open ? styles.shellOpen : ''}`} inert={open}>
                {header}
                {children}
                {footer}
            </div>

            {/* Dims the pushed-aside page and gives a tap-to-close target. Sits over
                the content, not the panel, so the panel still reads as "pushing".
                tabIndex=-1: keyboard close is the drawer's ✕ and Escape, so this
                stays out of the tab order. */}
            <button
                type="button"
                className={`${styles.scrim} ${open ? styles.scrimOpen : ''}`}
                aria-label={t('closeMenu')}
                tabIndex={-1}
                onClick={closeMenu}
            />

            <aside
                ref={drawerRef}
                id={panelId}
                className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
                aria-label={t('menu')}
                aria-hidden={!open}
                inert={!open}
            >
                <div className={styles.drawerHead}>
                    <span className={styles.drawerTitle}>{t('menu')}</span>
                    <button
                        type="button"
                        data-nav-autofocus
                        className={styles.closeButton}
                        onClick={closeMenu}
                        aria-label={t('closeMenu')}
                    >
                        <XIcon size={16} />
                    </button>
                </div>

                <nav className={styles.drawerNav} aria-label={t('menu')}>
                    {/* Mirrors the desktop header links. Re-enable alongside the header copies. */}
                    {/* <Link href="/docs" className={styles.drawerLink} onClick={closeMenu}>{t('docs')}</Link> */}
                    <Link href="/security" className={styles.drawerLink} onClick={closeMenu}>
                        {t('security')}
                    </Link>
                    <Link href="/threat-model" className={styles.drawerLink} onClick={closeMenu}>
                        {t('threatModel')}
                    </Link>
                    <Link href="/faq" className={styles.drawerLink} onClick={closeMenu}>
                        {t('faq')}
                    </Link>
                    {/* <Link href="/developers" className={styles.drawerLink} onClick={closeMenu}>{t('api')}</Link> */}
                </nav>

                <div className={styles.controls}>
                    <div className={styles.control}>
                        <span className={styles.sectionLabel}>{tTheme('legend')}</span>
                        <ThemeSwitch />
                    </div>
                    <div className={styles.control}>
                        <span className={styles.sectionLabel}>{t('language')}</span>
                        <LangPicker />
                    </div>
                </div>
            </aside>
        </Ctx.Provider>
    );
}
