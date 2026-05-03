import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import packageJson from '../../../package.json';

const SOURCE_URL = 'https://github.com/Markuper-tech/burnotes';

export async function SiteFooter() {
    const t = await getTranslations('foot');

    return (
        <footer className="foot">
            <span>v{packageJson.version}{packageJson?.license ? ` · open source under ${packageJson.license} license` : ''}</span>
            <nav className="foot-links" aria-label="Footer">
                <Link href="/security#privacy">{t('privacy')}</Link>
                <Link href="/security#terms">{t('terms')}</Link>
                <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                    {t('status')}
                </a>
            </nav>
        </footer>
    );
}
