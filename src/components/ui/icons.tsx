import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
    size?: number;
};

const baseStrokeProps = {
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

function strokeIcon(defaultSize: number, content: React.ReactNode, overrides?: Partial<typeof baseStrokeProps>) {
    const Component = ({ size = defaultSize, ...rest }: IconProps) => (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            {...baseStrokeProps}
            {...overrides}
            {...rest}
        >
            {content}
        </svg>
    );
    return Component;
}

export const LockIcon = strokeIcon(
    16,
    <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>,
);

export const UnlockIcon = strokeIcon(
    16,
    <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </>,
);

export const FlameIcon = strokeIcon(
    16,
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
);

export const CopyIcon = strokeIcon(
    14,
    <>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
);

export const CheckIcon = strokeIcon(14, <polyline points="20 6 9 17 4 12" />, { strokeWidth: 2.5 });

export const EyeIcon = strokeIcon(
    16,
    <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
    </>,
);

export const EyeOffIcon = strokeIcon(
    16,
    <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
        <line x1="2" y1="2" x2="22" y2="22" />
    </>,
);

export const ClockIcon = strokeIcon(
    14,
    <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </>,
);

export const ShieldIcon = strokeIcon(14, <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);

export const KeyIcon = strokeIcon(
    14,
    <>
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="M21 2l-9.6 9.6" />
        <path d="M15.5 7.5l3 3L22 7l-3-3" />
    </>,
);

export const SendIcon = strokeIcon(
    14,
    <>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </>,
);

export const PlusIcon = strokeIcon(
    14,
    <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </>,
);

export const MinusIcon = strokeIcon(14, <line x1="5" y1="12" x2="19" y2="12" />);

export const InfoIcon = strokeIcon(
    14,
    <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
    </>,
);

export const AlertIcon = strokeIcon(
    14,
    <>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </>,
);

export const TrashIcon = strokeIcon(
    14,
    <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>,
);

export const FileIcon = strokeIcon(
    14,
    <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
    </>,
);

export const LinkIcon = strokeIcon(
    14,
    <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>,
);

export const ArrowRightIcon = strokeIcon(
    14,
    <>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
    </>,
);

export const RefreshIcon = strokeIcon(
    14,
    <>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>,
);

export const GithubIcon = ({ size = 14, ...rest }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        {...rest}
    >
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.39.97.1-.75.4-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.21-1.49 3.18-1.18 3.18-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.09 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
    </svg>
);

export const TerminalIcon = strokeIcon(
    14,
    <>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
    </>,
);

export const ZapIcon = strokeIcon(14, <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />);

export const QrCodeIcon = strokeIcon(
    14,
    <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <path d="M14 14h2v2h-2zM18 14h3M14 18h3v3M21 18v3" />
    </>,
);

export const ShareIcon = strokeIcon(
    14,
    <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </>,
);
