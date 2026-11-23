"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { StatusTag, buttonClass } from "@/components/ui";
import { RemoveBlockSheet, type RemoveBlockAction, type RemoveTarget } from "../blocks/RemoveBlockSheet";
import { ChevronRight, PlusIcon } from "../icons";
import { KIND_WORD, type DayModel, type PlacedItem, type RowModel } from "./model";
import { KIND_CLASS, kindStyle } from "./styles";
import { blockHref, removeTargetFor } from "./DayGrid";

const TONE = { booking: "ok", request: "warn", block: "neutral", closure: "neutral", hold: "neutral" } as const;

/**
 * One field's day as a list: "3:00 to 5:30 PM, Westside practice", then
 * "Open 5:30 to 7:30 PM" with Add block here.
 */
export function FieldDayList({ day, row, removeAction }: { day: DayModel; row: RowModel; removeAction: RemoveBlockAction }) {
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-card border border-line bg-white">
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[17px] font-bold text-ink">
            {row.code}
            {row.name && row.name !== row.code ? <span className="ml-2 text-[14px] font-medium text-muted">{row.name}</span> : null}
          </h2>
          <p className="text-[13px] text-muted">Times in {day.timeZoneLabel}</p>
        </div>

        {row.agenda.length === 0 ? (
          <p className="px-5 py-10 text-center text-[15px] text-muted">
            {day.isPast ? `Nothing was booked or blocked on ${row.code}.` : `Nothing on ${row.code} this day.`}
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {row.agenda.map((entry, i) =>
              entry.type === "item" ? (
                <li key={entry.item.id}>
                  <ItemRow item={entry.item} split={row.lanes.length > 0} onBlock={() => setRemoving(removeTargetFor(entry.item, day.date))} />
                </li>
              ) : (
                <li key={`open-${i}`} className="flex items-center gap-3 bg-paper/40 px-4 py-2.5 sm:px-5">
                  <span aria-hidden className="h-9 w-1 shrink-0 rounded-full border border-dashed border-[#b6bfcc]" />
                  <p className="min-w-0 flex-1 text-[15px] leading-snug">
                    <span className="font-semibold text-ink">Open {entry.slot.timeLabel}</span>
                    {!entry.slot.full ? <span className="text-muted"> · {entry.slot.code} only</span> : null}
                  </p>
                  <Link
                    href={blockHref(day.date, entry.slot)}
                    className={buttonClass({ variant: "ghost", size: "sm" }, "min-h-11 shrink-0 px-3.5")}
                    aria-label={`Add block on ${entry.slot.code}, ${entry.slot.timeLabel}`}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add block here
                  </Link>
                </li>
              ),
            )}
          </ol>
        )}
      </div>
      <RemoveBlockSheet target={removing} onClose={() => setRemoving(null)} removeAction={removeAction} />
    </>
  );
}

function ItemRow({ item, split, onBlock }: { item: PlacedItem; split: boolean; onBlock: () => void }) {
  const content = (
    <>
      <span
        aria-hidden
        className={cn("h-10 w-1.5 shrink-0 rounded-full", KIND_CLASS[item.kind])}
        style={kindStyle(item.kind)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold tabular-nums leading-snug text-ink">{item.timeLabel}</span>
        <span className="block truncate text-[14.5px] leading-snug text-text">{item.label}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusTag tone={TONE[item.kind]}>{KIND_WORD[item.kind]}</StatusTag>
        {split && !item.full ? <span className="text-[12px] font-semibold text-muted">{item.scopeCode}</span> : null}
      </span>
    </>
  );
  const rowCls = "flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left sm:px-5";

  if (item.bookingId && (item.kind === "booking" || item.kind === "request")) {
    return (
      <Link href={`/staff/bookings/${item.bookingId}`} className={cn(rowCls, "hover:bg-paper/60")}>
        {content}
        <ChevronRight className="h-4 w-4 text-muted" />
      </Link>
    );
  }
  if (item.blockId) {
    return (
      <button type="button" onClick={onBlock} className={cn(rowCls, "hover:bg-paper/60")}>
        {content}
        <ChevronRight className="h-4 w-4 text-muted" />
      </button>
    );
  }
  return (
    <div className={rowCls}>
      {content}
      <span className="w-4" />
    </div>
  );
}
