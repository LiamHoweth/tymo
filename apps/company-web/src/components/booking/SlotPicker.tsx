"use client";

import { useEffect, useState } from "react";
import type { DayAvailability, SlotOption } from "@tymo/shared/types";
import { cn } from "@tymo/shared/cn";
import { useTimeSelection } from "./TimeSelection";

const PERIODS: SlotOption["period"][] = ["Morning", "Afternoon", "Evening"];

/** Start times in 30-minute steps, grouped Morning / Afternoon / Evening. */
export function SlotPicker({ day, readOnly }: { day: DayAvailability; readOnly?: boolean }) {
  const { picked, pick } = useTimeSelection();

  // After a refresh (e.g. "just taken"), drop a choice that is no longer open.
  useEffect(() => {
    if (!picked) return;
    const fresh = day.slots.find((s) => s.startsAt === picked.slot.startsAt);
    if (!fresh?.available) pick(null);
  }, [day, picked, pick]);

  return (
    <div className="space-y-6">
      {PERIODS.map((period) => {
        const slots = day.slots.filter((s) => s.period === period);
        if (!slots.length) return null;
        const open = slots.filter((s) => s.available).length;
        return (
          <div key={period} role="group" aria-labelledby={`period-${period}`}>
            <div className="mb-2.5 flex items-baseline gap-2">
              <h3 id={`period-${period}`} className="text-[15px] font-semibold text-text">
                {period}
              </h3>
              <span className="text-[13px] text-muted">{open === 0 ? "None open" : `${open} open`}</span>
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
              {slots.map((slot) => (
                <li key={slot.startsAt}>
                  <SlotButton
                    slot={slot}
                    selected={picked?.slot.startsAt === slot.startsAt}
                    onPick={readOnly ? undefined : () => pick({ slot, dateLabel: day.dateLabel })}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function SlotButton({ slot, selected, onPick }: { slot: SlotOption; selected: boolean; onPick?: () => void }) {
  if (!onPick) {
    return (
      <span
        className={cn(
          "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-full border-[1.5px] px-1.5 py-1 text-center leading-tight",
          slot.available ? "border-line bg-white text-text" : "border-dashed border-[#c3cad6] bg-paper text-muted",
        )}
      >
        <span className="text-[14px] font-semibold tabular-nums">{slot.startLocal}</span>
        <span className="text-xs">{slot.available ? "Available" : "Not available"}</span>
      </span>
    );
  }

  if (!slot.available) {
    return (
      <button
        type="button"
        disabled
        className="flex h-12 w-full cursor-not-allowed flex-col items-center justify-center rounded-full border-[1.5px] border-dashed border-[#c3cad6] bg-paper leading-none text-muted"
      >
        <span className="text-[13px] font-semibold tabular-nums">{slot.startLocal}</span>
        <span className="mt-1 text-[10.5px] font-medium">Not available</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={cn(
        "flex h-12 w-full items-center justify-center rounded-full border-[1.5px] text-[15px] font-semibold tabular-nums",
        "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
        selected ? "border-ink bg-ink text-white" : "border-line bg-white text-text hover:border-text",
      )}
    >
      {slot.startLocal}
    </button>
  );
}

/** Gray placeholder buttons while times load; after 3 seconds, a note. */
export function SlotsSkeleton() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 3000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div aria-busy="true" className="space-y-6">
      <p className="sr-only" role="status">
        {slow ? "Still checking open times..." : "Checking open times"}
      </p>
      {[6, 9, 6].map((count, i) => (
        <div key={i}>
          <div className="mb-3 h-4 w-24 animate-pulse rounded-full bg-line" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: count }, (_, j) => (
              <div key={j} className="h-12 animate-pulse rounded-full bg-[#e6eaf1]" />
            ))}
          </div>
        </div>
      ))}
      {slow ? (
        <p aria-hidden className="text-[14px] font-medium text-muted">
          Still checking open times...
        </p>
      ) : null}
    </div>
  );
}
