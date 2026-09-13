'use client';

import { useTranslations } from 'next-intl';
import { LangPicker } from '@/components/layout/lang-picker';
import { useMobileNav } from '@/components/layout/nav-shell';
import { ThemeSwitch } from '@/components/layout/theme-switch';
// GithubIcon is unused while the Source nav link is hidden; re-add it
// to this import when uncommenting the link below.
import { FlameIcon, MenuIcon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';
import styles from './site-header.module.css';

// const SOURCE_URL = 'https://github.com/Markuper-tech/burnotes';

export function SiteHeader() {
    const t = useTranslations('nav');
    const { open, toggle, triggerId, panelId, registerTrigger } = useMobileNav();

    return (
        <header className={styles.nav}>
            <div className={styles.inner}>
                <Link href="/" className={styles.brand}>
                    <span className={styles.brandMark} aria-hidden="true">
                        <FlameIcon size={14} />
                    </span>
                    <span className={styles.brandName}>
                        burnotes<span className={styles.dot}>.app</span>
                    </span>
                </Link>
                <nav className={styles.links} aria-label="Primary">
                    {/* <Link href="/docs" className="nav-link">
                        {t('docs')}
                    </Link> */}
                    <Link href="/security" className={styles.link}>
                        {t('security')}
                    </Link>
                    <Link href="/threat-model" className={styles.link}>
                        {t('threatModel')}
                    </Link>
                    <Link href="/faq" className={styles.link}>
                        {t('faq')}
                    </Link>
                    {/* <Link href="/developers" className="nav-link">
                        {t('api')}
                    </Link> */}
                    {/* Hidden for now; re-enable by uncommenting.
                    <a href={SOURCE_URL} className="nav-link" target="_blank" rel="noreferrer" aria-label={t('source')}>
                        <GithubIcon size={14} />
                        <span>{t('source')}</span>
                    </a> */}
                    <LangPicker />
                    <ThemeSwitch />
                </nav>
                {/* Opener only: while open the page (and this button) sit under the
                    scrim — closing is the drawer's own ✕, a scrim tap, or Escape. */}
                <button
                    ref={registerTrigger}
                    id={triggerId}
                    type="button"
                    className={styles.menuTrigger}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={panelId}
                    aria-label={t('openMenu')}
                    onClick={toggle}
                >
                    <MenuIcon size={18} />
                </button>
            </div>
        </header>
    );
}
