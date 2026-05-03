'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EyeIcon, EyeOffIcon, KeyIcon } from '@/components/ui/icons';
import { MAX_PASSWORD_LENGTH } from '@/lib/password-policy';

type Props = {
    value: string;
    onChange: (next: string) => void;
};

export function PasswordField({ value, onChange }: Props) {
    const t = useTranslations('create');
    const [shown, setShown] = useState(false);

    return (
        <div className="field">
            <label className="field-label" htmlFor="passphrase">
                <KeyIcon size={12} /> {t('passphrase')}
                <span className="field-label-hint"> {t('passphraseHint')}</span>
            </label>
            <div className="field-row">
                <div className="password-wrap">
                    <input
                        id="passphrase"
                        type={shown ? 'text' : 'password'}
                        autoComplete="new-password"
                        spellCheck={false}
                        value={value}
                        maxLength={MAX_PASSWORD_LENGTH}
                        onChange={(event) => onChange(event.target.value)}
                        placeholder={t('passphrasePh')}
                        className="password-input"
                    />
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon password-toggle"
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
