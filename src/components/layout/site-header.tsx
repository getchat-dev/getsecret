import { getTranslations } from 'next-intl/server';
import { LangPicker } from '@/components/layout/lang-picker';
import { ThemeSwitch } from '@/components/layout/theme-switch';
import { FlameIcon, GithubIcon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';

const SOURCE_URL = 'https://github.com/Markuper-tech/burnotes';

export async function SiteHeader() {
    const t = await getTranslations('nav');

    return (
        <header className="nav">
            <div className="nav-inner">
                <Link href="/" className="brand">
                    <span className="brand-mark" aria-hidden="true">
                        <FlameIcon size={14} />
                    </span>
                    <span className="brand-name">
                        Burnotes<span className="dot">.am</span>
                    </span>
                </Link>
                <nav className="nav-links" aria-label="Primary">
                    <Link href="/docs" className="nav-link">
                        {t('docs')}
                    </Link>
                    <Link href="/security" className="nav-link">
                        {t('security')}
                    </Link>
                    <Link href="/developers" className="nav-link">
                        {t('api')}
                    </Link>
                    <a href={SOURCE_URL} className="nav-link" target="_blank" rel="noreferrer" aria-label={t('source')}>
                        <GithubIcon size={14} />
                        <span>{t('source')}</span>
                    </a>
                    <span className="nav-status" role="status">
                        <span className="status-dot" aria-hidden="true" />
                        {t('status')}
                    </span>
                    <LangPicker />
                    <ThemeSwitch />
                </nav>
            </div>
        </header>
    );
}
