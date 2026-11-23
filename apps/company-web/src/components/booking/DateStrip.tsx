"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@tymo/shared/cn";
import { Calendar } from "./icons";

export interface DateStripChip {
  date: string;
  weekday: string; // "Sat"
  day: string; // "Dec 5"
  closed: boolean;
  bookable: boolean;
  href: string;
}

/**
 * The next 14 days as chips, then "More dates" (a native date input, so
 * phones get their own picker). Chips are links: the date lives in the URL.
 * Closed and unbookable days stay tappable so they can explain themselves.
 */
export function DateStrip({
  chips,
  selected,
  selectedLabel,
  min,
  max,
  moreHref,
}: {
  chips: DateStripChip[];
  selected: string;
  /** "Mon, Jan 4" when the selected date is beyond the chips. */
  selectedLabel: string;
  min: string;
  max: string;
  /** URL template with "{date}" where the picked date goes. */
  moreHref: string;
}) {
  const router = useRouter();
  const stripRef = useRef<HTMLUListElement>(null);
  const inStrip = chips.some((c) => c.date === selected);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>("[aria-current='date']");
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);

  return (
    <div>
      <ul
        ref={stripRef}
        className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((chip) => {
          const isSelected = chip.date === selected;
          const status = chip.closed ? "Closed" : chip.bookable ? null : "Not available";
          return (
            <li key={chip.date} className="snap-start">
              <Link
                href={chip.href}
                replace
                scroll={false}
                aria-current={isSelected ? "date" : undefined}
                className={cn(
                  "flex min-h-[72px] min-w-[76px] flex-col items-center justify-center rounded-2xl border-[1.5px] px-3 py-2 text-center transition-colors",
                  isSelected
                    ? "border-ink bg-ink text-white"
                    : chip.bookable
                      ? "border-line bg-white text-text hover:border-text"
                      : "border-dashed border-[#c3cad6] bg-paper text-muted hover:border-muted",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-[0.12em]",
                    isSelected ? "text-white/75" : "text-muted",
                  )}
                >
                  {chip.weekday}
                </span>
                <span className="mt-0.5 whitespace-nowrap text-[15px] font-semibold leading-tight">{chip.day}</span>
                {status ? (
                  <span
                    className={cn(
                      "mt-0.5 whitespace-nowrap text-[11px] font-medium",
                      isSelected ? "text-white/80" : "text-muted",
                    )}
                  >
                    {status}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        <label
          className={cn(
            "relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4 text-[14px] font-semibold transition-colors",
            "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
            inStrip ? "border-line bg-white text-text hover:border-text" : "border-ink bg-ink text-white",
          )}
        >
          <Calendar className="h-4 w-4" />
          <span aria-hidden>{inStrip ? "More dates" : `${selectedLabel} · More dates`}</span>
          <input
            key={selected}
            type="date"
            aria-label={inStrip ? "More dates" : `More dates, ${selectedLabel} selected`}
            min={min}
            max={max}
            defaultValue={inStrip ? undefined : selected}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                // Older browsers: the focused input still accepts a typed date.
              }
            }}
            onChange={(e) => {
              const value = e.currentTarget.value;
              if (value && value !== selected) router.replace(moreHref.replace("{date}", value), { scroll: false });
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
