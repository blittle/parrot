// Small stroke icons for navigation and controls. They inherit the text colour.

type Props = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const ListsIcon = ({ size = 24 }: Props) => (
  <svg {...base(size)}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

export const PracticeIcon = ({ size = 24 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
    <path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" />
  </svg>
);

export const VoicesIcon = ({ size = 24 }: Props) => (
  <svg {...base(size)}>
    <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
  </svg>
);

export const SettingsIcon = ({ size = 24 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const PlayIcon = ({ size = 24 }: Props) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" />
  </svg>
);

export const PauseIcon = ({ size = 24 }: Props) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

export const PrevIcon = ({ size = 24 }: Props) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M18 5.5v13a1 1 0 0 1-1.5.8L7 13v5a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5l9.5-6.3a1 1 0 0 1 1.5.8z" />
  </svg>
);

export const NextIcon = ({ size = 24 }: Props) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M6 5.5v13a1 1 0 0 0 1.5.8L17 13v5a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v5L7.5 4.7A1 1 0 0 0 6 5.5z" />
  </svg>
);

export const CheckIcon = ({ size = 20 }: Props) => (
  <svg {...base(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ChevronIcon = ({ size = 20 }: Props) => (
  <svg {...base(size)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const DownloadIcon = ({ size = 20 }: Props) => (
  <svg {...base(size)}>
    <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
  </svg>
);
