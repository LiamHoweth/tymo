import { cn } from "@tymo/shared/cn";

/** Small stroke icons for the booking flow. Decorative; labels carry meaning. */
function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path d={d} />
    </svg>
  );
}

export const ChevronLeft = ({ className }: { className?: string }) => <Icon d="M15 18l-6-6 6-6" className={className} />;
export const ArrowRight = ({ className }: { className?: string }) => <Icon d="M5 12h14M13 6l6 6-6 6" className={className} />;
export const Clock = ({ className }: { className?: string }) => (
  <Icon d="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className={className} />
);
export const Lock = ({ className }: { className?: string }) => (
  <Icon d="M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z" className={className} />
);
export const Phone = ({ className }: { className?: string }) => (
  <Icon
    d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"
    className={className}
  />
);
export const Calendar = ({ className }: { className?: string }) => (
  <Icon d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" className={className} />
);
