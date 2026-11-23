"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ChevronLeft, ChevronRight } from "../icons";

/**
 * Prev / date picker / Next / Today. All state lives in the URL so Back
 * works and links can be shared. `aside` sits on the right from sm up.
 */
export function DateNavigator({
  label,
  date,
  prevHref,
  nextHref,
  todayHref,
  isCurrent,
  view,
  pickHref,
  aside,
}: {
  /** "Mon, Nov 23" or "Nov 23 to 29". */
  label: string;
  date: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  /** Already showing today / this week. */
  isCurrent: boolean;
  view: "day" | "week";
  /** URL template for a picked date: "{date}" is replaced. */
  pickHref: string;
  aside?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unit = view === "day" ? "day" : "week";

  return (
    <div className={cn("flex items-center justify-between gap-3", pending && "opacity-70")}>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
        <Link
          href={prevHref}
          aria-label={`Previous ${unit}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-white text-ink hover:border-text"
        >
          <ChevronLeft />
        </Link>
        <label className="relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-line bg-white px-4 text-[15px] font-bold text-ink focus-within:outline focus-within:outline-2 focus-within:outline-accent hover:border-text sm:min-w-44 sm:flex-none sm:px-5">
          <span className="truncate">{label}</span>
          <span className="sr-only">. Pick a date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const v = e.target.value;
              if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
              startTransition(() => router.push(pickHref.replace("{date}", v)));
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <Link
          href={nextHref}
          aria-label={`Next ${unit}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-white text-ink hover:border-text"
        >
          <ChevronRight />
        </Link>
        {!isCurrent ? (
          <Link
            href={todayHref}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-[14px] font-semibold text-brand underline-offset-4 hover:underline sm:px-3"
          >
            {view === "day" ? "Today" : "This week"}
          </Link>
        ) : null}
      </div>
      {aside ? <div className="hidden shrink-0 items-center gap-2 sm:flex">{aside}</div> : null}
    </div>
  );
}

/** Day / Week switch. */
export function ViewToggle({ view, dayHref, weekHref }: { view: "day" | "week"; dayHref: string; weekHref: string }) {
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-full border-[1.5px] border-line bg-white p-0.5">
      {(
        [
          ["day", "Day", dayHref],
          ["week", "Week", weekHref],
        ] as const
      ).map(([key, text, href]) => (
        <Link
          key={key}
          href={href}
          aria-current={view === key ? "true" : undefined}
          className={cn(
            "inline-flex min-h-11 min-w-14 items-center justify-center rounded-full px-3.5 text-[14px] font-semibold",
            view === key ? "bg-ink text-white" : "text-muted hover:text-ink",
          )}
        >
          {text}
        </Link>
      ))}
    </div>
  );
}
