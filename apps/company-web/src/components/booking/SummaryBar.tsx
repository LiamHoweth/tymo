import type { ReactNode } from "react";
import { cn } from "@tymo/shared/cn";

/**
 * The dark "purchase card". On phones it is a sticky bar at the bottom
 * (safe-area aware) with the when line, price and the step's action; from
 * lg it becomes a card in the right column with the field name on top.
 */
export function SummaryBar({
  title,
  when,
  price,
  priceNote,
  action,
  message,
  footer,
  className,
}: {
  /** Field name ("N1 · Half A"); shown on the large card. */
  title?: ReactNode;
  /** "Sat, Dec 5 · 5:00–6:30 PM CT" */
  when: ReactNode;
  price?: ReactNode;
  priceNote?: ReactNode;
  action: ReactNode;
  /** Error or status line above the content (pass a role="alert" node). */
  message?: ReactNode;
  /** Hold timer line under the bar. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label="Your booking"
      className={cn("fixed inset-x-0 bottom-0 z-30 lg:static lg:inset-auto lg:z-auto", className)}
    >
      <div
        className={cn(
          "ink-card rounded-t-[22px] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3.5",
          "shadow-[0_-14px_40px_-16px_rgb(0_9_36/0.55)] sm:px-6",
          "lg:rounded-[24px] lg:p-6 lg:shadow-[0_24px_60px_-28px_rgb(0_9_36/0.6)]",
        )}
      >
        {message ? <div className="mb-3">{message}</div> : null}
        <div className="mx-auto flex max-w-6xl items-center gap-4 lg:block">
          <div className="min-w-0 flex-1">
            <p className="kicker mb-3 hidden text-white/55 lg:block">Your booking</p>
            {title ? <p className="display mb-3 hidden text-[1.65rem] leading-[0.95] lg:block">{title}</p> : null}
            <p className="text-[13px] leading-snug text-white/75 lg:text-[15px] lg:text-white/85">
              {typeof when === "string"
                ? when.split(" · ").map((part, i) => (
                    <span key={i}>
                      {i ? " · " : null}
                      <span className="whitespace-nowrap">{part}</span>
                    </span>
                  ))
                : when}
            </p>
            {price ? (
              <p className="mt-0.5 text-[20px] font-bold leading-tight tabular-nums lg:mt-4 lg:text-[30px]">{price}</p>
            ) : null}
            {priceNote ? <p className="mt-1 hidden text-[13px] leading-snug text-white/60 lg:block">{priceNote}</p> : null}
          </div>
          <div className="shrink-0 lg:mt-6">{action}</div>
        </div>
        {footer ? <div className="mx-auto mt-2.5 max-w-6xl border-t border-white/10 pt-2 lg:mt-5 lg:pt-4">{footer}</div> : null}
      </div>
    </aside>
  );
}

/** Responsive classes for the bar's primary button: a pill on phones, full width on the card. */
export const barButtonClass = "min-w-[7.5rem] lg:h-14 lg:w-full lg:text-base";
