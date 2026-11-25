import { cn } from "@tymo/shared/cn";

type IconProps = { className?: string };

/** Square-capped line icons for the admin console; decorative, so hidden from assistive tech. */
export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-4 w-4", className)} aria-hidden fill="none">
      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-4 w-4", className)} aria-hidden fill="none">
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

export function ExternalIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5", className)} aria-hidden fill="none">
      <path d="M6 3.5h6.5V10M12.5 3.5 4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}
