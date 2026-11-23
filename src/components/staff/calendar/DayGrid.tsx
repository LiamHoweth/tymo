"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui";
import { RemoveBlockSheet, type RemoveBlockAction, type RemoveTarget } from "../blocks/RemoveBlockSheet";
import { ChevronRight, CloseIcon, PlusIcon } from "../icons";
import type { DayModel, OpenSlot, PlacedItem, RowModel } from "./model";
import { FieldTimeline, HourAxis } from "./Timeline";
import { HATCH } from "./styles";

export function blockHref(date: string, slot: OpenSlot) {
  const q = new URLSearchParams({ field: slot.resourceId, date, start: slot.startHHMM, end: slot.endHHMM });
  return `/staff/blocks/new?${q.toString()}`;
}

/** The field's day as a list (the phone view of one row). */
export function fieldDayHref(date: string, resourceId: string) {
  return `/staff/calendar?${new URLSearchParams({ date, field: resourceId }).toString()}`;
}

export function removeTargetFor(item: PlacedItem, date: string): RemoveTarget | null {
  if (!item.blockId) return null;
  return {
    blockId: item.blockId,
    label: item.label,
    kind: item.kind === "closure" ? "closure" : "block",
    date: item.occurrenceDate ?? date,
    weekly: Boolean(item.occurrenceDate),
    code: item.scopeCode,
    timeLabel: item.timeLabel === "All day" ? "all day" : item.timeLabel,
  };
}

/**
 * Day view: one row per field, halves as thin lanes beneath. Phones tap a
 * row to open that field's day as a list; desktop taps items directly and
 * taps open time to add a block there.
 */
export function DayGrid({ day, removeAction }: { day: DayModel; removeAction: RemoveBlockAction }) {
  const [open, setOpen] = useState<{ rowId: string; slot: OpenSlot } | null>(null);
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);

  function findOpen(row: RowModel, minute: number | null, laneId: string | null) {
    const slots = row.agenda.flatMap((e) => (e.type === "open" ? [e.slot] : []));
    const fits = (s: OpenSlot) => minute === null || (minute >= s.startMin && minute < s.endMin);
    // A lane tap prefers that half; a field tap prefers the whole field.
    const pick =
      (laneId ? slots.find((s) => s.resourceId === laneId && fits(s)) : undefined) ??
      slots.find((s) => s.full && fits(s)) ??
      (laneId ? undefined : slots.find((s) => fits(s)));
    setOpen(pick ? { rowId: row.resourceId, slot: pick } : null);
  }

  return (
    <>
      <div className="overflow-hidden rounded-card border border-line bg-white">
        <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-end gap-x-3 border-b border-line px-3 pb-1.5 pt-3 lg:grid-cols-[8.5rem_minmax(0,1fr)] lg:px-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Field</span>
          <HourAxis startMin={day.startMin} endMin={day.endMin} />
        </div>

        {day.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[15px] text-muted">No fields set up yet. Tymo adds your fields during setup.</p>
        ) : (
          <ul>
            {day.rows.map((row) => {
              const itemCount = row.items.filter((i) => i.kind !== "hold").length;
              return (
                <li key={row.resourceId} className="border-b border-line last:border-b-0">
                  <div className="relative grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-3 px-3 py-2.5 lg:grid-cols-[8.5rem_minmax(0,1fr)] lg:px-5 lg:py-3">
                    {/* Phones: the whole row opens the field's day list. */}
                    <Link
                      href={fieldDayHref(day.date, row.resourceId)}
                      className="absolute inset-0 z-10 lg:hidden"
                      aria-label={`${row.code}: ${itemCount === 0 ? "nothing booked" : `${itemCount} on the calendar`}. Open as a list`}
                    />
                    <Link
                      href={fieldDayHref(day.date, row.resourceId)}
                      className="group flex min-h-7 min-w-0 flex-col justify-center rounded-md lg:min-h-8"
                    >
                      <span className="flex items-center gap-1 text-[14px] font-bold leading-tight text-ink">
                        {row.code}
                        <ChevronRight className="hidden h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100 lg:block" />
                      </span>
                      {row.name && row.name !== row.code ? (
                        <span className="hidden truncate text-[12px] text-muted lg:block">{row.name}</span>
                      ) : null}
                    </Link>
                    <FieldTimeline
                      row={row}
                      startMin={day.startMin}
                      endMin={day.endMin}
                      nowMin={day.nowMin}
                      handlers={{
                        onBlock: (item) => setRemoving(removeTargetFor(item, day.date)),
                        onEmpty: day.isPast ? undefined : (minute, laneId) => findOpen(row, minute, laneId),
                      }}
                    />
                  </div>
                  {open && open.rowId === row.resourceId ? (
                    <div className="rise-in hidden items-center gap-3 border-t border-dashed border-line bg-paper/70 px-5 py-2.5 lg:flex">
                      <p className="flex-1 text-[14px]">
                        <span className="font-semibold text-ink">Open {open.slot.timeLabel}</span>
                        <span className="text-muted"> on {open.slot.code}</span>
                      </p>
                      <Link href={blockHref(day.date, open.slot)} className={buttonClass({ variant: "ink", size: "sm" }, "min-h-10")}>
                        <PlusIcon className="h-4 w-4" />
                        Add block here
                      </Link>
                      <button
                        type="button"
                        onClick={() => setOpen(null)}
                        aria-label="Close"
                        className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-white hover:text-ink"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <RemoveBlockSheet target={removing} onClose={() => setRemoving(null)} removeAction={removeAction} />
    </>
  );
}

/** Words-plus-swatch key for the bars. */
export function Legend({ className }: { className?: string }) {
  const items: { label: string; cls: string; style?: CSSProperties }[] = [
    { label: "Booked", cls: "bg-brand" },
    { label: "Request", cls: "bg-white ring-[1.5px] ring-inset ring-brand" },
    {
      label: "Block",
      cls: "ring-1 ring-inset ring-[#9aa4b4]",
      style: HATCH,
    },
    { label: "Closed", cls: "bg-[#c3c9d4]" },
    { label: "Checking out", cls: "bg-paper border border-dashed border-[#8a93a3]" },
  ];
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] font-medium text-muted", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-3 w-5 rounded-[3px]", i.cls)} style={i.style} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
