'use client';

import { useTranslations } from 'next-intl';
import { LangPicker } from '@/components/layout/lang-picker';
import { ThemeSwitch } from '@/components/layout/theme-switch';
// GithubIcon is unused while the Source nav link is hidden; re-add it
// to this import when uncommenting the link below.
import { FlameIcon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';
import styles from './site-header.module.css';

// const SOURCE_URL = 'https://github.com/Markuper-tech/burnotes';

export function SiteHeader() {
    const t = useTranslations('nav');

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
            </div>
        </header>
    );
}
