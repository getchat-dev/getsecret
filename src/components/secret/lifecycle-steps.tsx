'use client';

import { useTranslations } from 'next-intl';
import styles from './lifecycle-steps.module.css';

const STEP_KEYS = ['create', 'generated', 'locked', 'revealed', 'burned'] as const;

export type LifecycleStep = 1 | 2 | 3 | 4 | 5;

type Props = {
    activeStep: LifecycleStep;
};

export function LifecycleSteps({ activeStep }: Props) {
    const tabs = useTranslations('tabs');
    const root = useTranslations();
    const legend = root('tabsLegend');

    return (
        <div className={styles.lifecycle}>
            <div className={styles.legend}>
                <span>{legend}</span>
                <span className={styles.legendRule} aria-hidden="true" />
            </div>
            <ol className={`${styles.tabs} ${styles.list}`} aria-label={legend}>
                {STEP_KEYS.map((key, index) => {
                    const stepNumber = index + 1;
                    const isActive = stepNumber === activeStep;
                    const isPast = stepNumber < activeStep;
                    const className = isActive ? styles.active : isPast ? styles.past : '';
                    return (
                        <li key={key} className={className} aria-current={isActive ? 'step' : undefined}>
                            <span className={styles.num}>{String(stepNumber).padStart(2, '0')}</span>
                            <span>{tabs(key)}</span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
