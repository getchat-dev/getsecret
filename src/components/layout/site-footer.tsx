'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import packageJson from '../../../package.json';

export function SiteFooter() {
    const t = useTranslations('foot');

    return (
        <footer className="foot">
            <span>
                v{packageJson.version}
                {packageJson?.license ? ` · open source under ${packageJson.license} license` : ''}
            </span>
            <nav className="foot-links" aria-label="Footer">
                <Link href="/security#privacy">{t('privacy')}</Link>
                <Link href="/security#terms">{t('terms')}</Link>
            </nav>
            <span className="foot-status" role="status">
                <span className="status-dot" aria-hidden="true" />
                {t('statusOk')}
            </span>
        </footer>
    );
}
