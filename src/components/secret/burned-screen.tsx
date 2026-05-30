'use client';

import { useTranslations } from 'next-intl';
// Hidden for now; re-enable by uncommenting this import and the
// <LifecycleSteps activeStep={5} /> usage below.
// import { LifecycleSteps } from '@/components/secret/lifecycle-steps';
import { FlameIcon, LockIcon } from '@/components/ui/icons';
import { Link } from '@/i18n/navigation';
import btn from '@/styles/primitives/button.module.css';
import card from '@/styles/primitives/card.module.css';
import field from '@/styles/primitives/field.module.css';
import reveal from '@/styles/primitives/reveal.module.css';

type Props = {
    reason?: 'not-found' | 'consumed' | 'locked-out' | 'expired';
};

export function BurnedScreen({ reason: _reason }: Props = {}) {
    const t = useTranslations('burned');
    const tErrors = useTranslations('errors');

    return (
        <>
            {/* <LifecycleSteps activeStep={5} /> */}
            <span className="eyebrow">
                <FlameIcon size={12} className="flame" /> {t('gone')}
            </span>
            <h1 className="display">
                {t('title1')} <span className="accent-word">{t('title2')}</span>
            </h1>
            <p className="lede">{t('lede')}</p>
            <section className={`${card.card} ${reveal.card} fade-up`}>
                <div className={reveal.lockIcon}>
                    <LockIcon size={28} />
                </div>
                <h2 className={reveal.title}>{t('heading')}</h2>
                <p className={reveal.sub}>{t('body')}</p>
                <p className={field.hint} style={{ textAlign: 'center', marginTop: 16 }}>
                    {tErrors('secretNotFound')}
                </p>
                <div className={reveal.actions}>
                    <Link href="/" className={`${btn.btn} ${btn.btnPrimary}`}>
                        {t('sendNew')}
                    </Link>
                </div>
            </section>
        </>
    );
}
