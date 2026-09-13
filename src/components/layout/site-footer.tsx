import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import styles from './site-footer.module.css';

// Версия и лицензия инжектятся через next.config.ts → process.env.NEXT_PUBLIC_*
// (читаются один раз при сборке/старте dev). Никаких импортов package.json
// и никаких fs-чтений на запрос.
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
const LICENSE = process.env.NEXT_PUBLIC_APP_LICENSE ?? '';

// AGPL §13: anyone who uses the service over a network has to be offered the
// Corresponding Source, and the licence itself suggests exactly this — a
// "Source" link in the interface. So the licence name in the footer is that
// link rather than a label; it is the site's compliance, not a credit.
const SOURCE_URL = 'https://github.com/getchat-dev/getsecret';

// The SPDX id carries a suffix nobody reads aloud; the footer shows the family
// name and keeps the exact id in package.json, where tooling looks for it.
const LICENSE_LABEL = LICENSE.replace(/-(only|or-later)$/, '');

export async function SiteFooter() {
    const t = await getTranslations('foot');

    return (
        <footer className={styles.foot}>
            <span className={styles.meta}>
                <span className={styles.version}>v{VERSION}</span>
                {LICENSE ? (
                    <a className={styles.license} href={SOURCE_URL} target="_blank" rel="noreferrer">
                        source · {LICENSE_LABEL}
                    </a>
                ) : null}
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
