import type { ReactNode } from "react";
import { cn } from "@tymo/shared/cn";

/**
 * Small stroke icons for the staff app. Decorative by default (aria-hidden);
 * the text next to each icon carries the meaning.
 */
function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-5 w-5 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

type P = { className?: string };

export const InboxIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="M4 13.5 6.2 5.6A1.5 1.5 0 0 1 7.6 4.5h8.8a1.5 1.5 0 0 1 1.4 1.1L20 13.5" />
    <path d="M4 13.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18v-4.5h-4.5l-1 2h-5l-1-2Z" />
  </Icon>
);

export const CalendarIcon = ({ className }: P) => (
  <Icon className={className}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const GearIcon = ({ className }: P) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Icon>
);

export const PhoneIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="M5 4h3.2l1.6 4-2 1.3a10.5 10.5 0 0 0 4.9 4.9l1.3-2 4 1.6V17a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </Icon>
);

export const MailIcon = ({ className }: P) => (
  <Icon className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </Icon>
);

export const ChevronLeft = ({ className }: P) => (
  <Icon className={className}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const ChevronRight = ({ className }: P) => (
  <Icon className={className}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

export const PlusIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ClockIcon = ({ className }: P) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const CheckIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const AlertIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="M12 4 2.8 19.5h18.4Z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </Icon>
);

export const CopyIcon = ({ className }: P) => (
  <Icon className={className}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Icon>
);

export const ExitIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
    <path d="M10.5 12H20m-3.5-3.5L20 12l-3.5 3.5" />
  </Icon>
);

export const CloseIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="m6.5 6.5 11 11m0-11-11 11" />
  </Icon>
);

export const OfflineIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="M3 3l18 18" />
    <path d="M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.6M14.8 10.3A10 10 0 0 1 19 12.9M2 9.4a14.5 14.5 0 0 1 4.3-2.8M11 5.6a14.5 14.5 0 0 1 11 3.8" />
    <path d="M12 20h.01" />
  </Icon>
);

export const ListIcon = ({ className }: P) => (
  <Icon className={className}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  </Icon>
);
