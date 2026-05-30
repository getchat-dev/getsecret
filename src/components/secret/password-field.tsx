'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EyeIcon, EyeOffIcon, KeyIcon } from '@/components/ui/icons';
import { MAX_PASSWORD_LENGTH } from '@/lib/password-policy';
import btn from '@/styles/primitives/button.module.css';
import field from '@/styles/primitives/field.module.css';

type Props = {
    value: string;
    onChange: (next: string) => void;
};

export function PasswordField({ value, onChange }: Props) {
    const t = useTranslations('create');
    const [shown, setShown] = useState(false);

    return (
        <div className={field.field}>
            <label className={field.label} htmlFor="passphrase">
                <KeyIcon size={12} /> {t('passphrase')}
                <span className={field.labelHint}> {t('passphraseHint')}</span>
            </label>
            <div className={field.row}>
                <div className={field.passwordWrap}>
                    <input
                        id="passphrase"
                        type={shown ? 'text' : 'password'}
                        autoComplete="new-password"
                        spellCheck={false}
                        value={value}
                        maxLength={MAX_PASSWORD_LENGTH}
                        onChange={(event) => onChange(event.target.value)}
                        placeholder={t('passphrasePh')}
                        className={field.passwordInput}
                    />
                    <button
                        type="button"
                        className={`${btn.btn} ${btn.btnGhost} ${btn.btnIcon} ${field.passwordToggle}`}
                        onClick={() => setShown((v) => !v)}
                        aria-label={shown ? t('hidePassword') : t('showPassword')}
                    >
                        {shown ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
