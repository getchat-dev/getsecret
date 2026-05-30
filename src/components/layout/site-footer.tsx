import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import styles from './site-footer.module.css';

// Версия и лицензия инжектятся через next.config.ts → process.env.NEXT_PUBLIC_*
// (читаются один раз при сборке/старте dev). Никаких импортов package.json
// и никаких fs-чтений на запрос.
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
const LICENSE = process.env.NEXT_PUBLIC_APP_LICENSE ?? '';

export async function SiteFooter() {
    const t = await getTranslations('foot');

    return (
        <footer className={styles.foot}>
            <span>
                v{VERSION}
                {LICENSE ? ` · open source under ${LICENSE} license` : ''}
            </span>
            <nav className={styles.links} aria-label="Footer">
                <Link href="/security#privacy">{t('privacy')}</Link>
                <Link href="/security#terms">{t('terms')}</Link>
            </nav>
            <span className={styles.status} role="status">
                <span className={styles.statusDot} aria-hidden="true" />
                {t('statusOk')}
            </span>
        </footer>
    );
}
