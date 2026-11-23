"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { RemoveBlockSheet, type RemoveBlockAction, type RemoveTarget } from "../blocks/RemoveBlockSheet";
import { clockLabel, weekdayDate } from "../format";
import type { DayModel } from "./model";
import { FieldTimeline, HourAxis } from "./Timeline";
import { fieldDayHref, removeTargetFor } from "./DayGrid";

/**
 * Week view. Phones show one field at a time (a row per day); desktop
 * shows every field against the seven days.
 */
export function WeekView({
  days,
  fieldId,
  weekHref,
  removeAction,
}: {
  days: DayModel[];
  /** Field shown on phones. */
  fieldId: string | null;
  /** Week link that keeps the date, for the phone field picker. */
  weekHref: string;
  removeAction: RemoveBlockAction;
}) {
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);
  const rows = days[0]?.rows ?? [];
  const selected = rows.find((r) => r.resourceId === fieldId) ?? rows[0];
  const startMin = days[0]?.startMin ?? 420;
  const endMin = days[0]?.endMin ?? 1260;

  if (!selected) {
    return <p className="rounded-card border border-line bg-white px-5 py-10 text-center text-[15px] text-muted">No fields set up yet.</p>;
  }

  const sep = weekHref.includes("?") ? "&" : "?";

  return (
    <>
      {/* Phones: one field, a row per day */}
      <div className="lg:hidden">
        <nav aria-label="Field" className="-mx-4 mb-3 overflow-x-auto px-4 pb-1">
          <ul className="flex w-max gap-2">
            {rows.map((r) => {
              const active = r.resourceId === selected.resourceId;
              return (
                <li key={r.resourceId}>
                  <Link
                    href={`${weekHref}${sep}field=${encodeURIComponent(r.resourceId)}`}
                    aria-current={active ? "true" : undefined}
                    scroll={false}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-[14px] font-semibold",
                      active ? "border-ink bg-ink text-white" : "border-line bg-white text-text",
                    )}
                  >
                    {r.code}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="overflow-hidden rounded-card border border-line bg-white">
          <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-end gap-x-3 border-b border-line px-3 pb-1.5 pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{selected.code}</span>
            <HourAxis startMin={startMin} endMin={endMin} />
          </div>
          <ul>
            {days.map((d) => {
              const row = d.rows.find((r) => r.resourceId === selected.resourceId);
              if (!row) return null;
              const [wd, , dayNum] = weekdayDate(d.date).split(" ");
              return (
                <li key={d.date} className="relative grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-3 border-b border-line px-3 py-2.5 last:border-b-0">
                  <Link
                    href={fieldDayHref(d.date, row.resourceId)}
                    className="absolute inset-0 z-10"
                    aria-label={`${row.code} on ${weekdayDate(d.date)}. Open as a list`}
                  />
                  <span className={cn("text-[14px] font-bold leading-tight", d.isToday ? "text-accent" : "text-ink")}>
                    {wd} <span className="font-medium text-muted">{dayNum}</span>
                  </span>
                  <FieldTimeline row={row} startMin={d.startMin} endMin={d.endMin} nowMin={d.nowMin} handlers={{ onBlock: () => {} }} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Desktop: every field against the week */}
      <div className="hidden overflow-x-auto rounded-card border border-line bg-white lg:block">
        <table className="w-full min-w-[56rem] table-fixed border-collapse">
          <caption className="sr-only">
            Every field for the week. In each cell, time runs {clockLabel(startMin)} to {clockLabel(endMin)} left to right.
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-28 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Field
              </th>
              {days.map((d) => (
                <th key={d.date} scope="col" className="px-1.5 py-2 text-left">
                  <Link
                    href={`/staff/calendar?date=${d.date}`}
                    className={cn(
                      "inline-flex min-h-9 items-center rounded-full px-2.5 text-[13px] font-bold hover:bg-paper",
                      d.isToday ? "bg-ink text-white hover:bg-ink" : "text-ink",
                    )}
                  >
                    {weekdayDate(d.date)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.resourceId} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-2.5 text-left">
                  <span className="block text-[14px] font-bold text-ink">{r.code}</span>
                  {r.lanes.length ? <span className="block text-[11.5px] text-muted">{r.lanes.map((l) => l.code).join(" · ")}</span> : null}
                </th>
                {days.map((d) => {
                  const row = d.rows.find((x) => x.resourceId === r.resourceId);
                  return (
                    <td key={d.date} className="relative px-1.5 py-2.5 align-middle">
                      {row ? (
                        <>
                          <Link
                            href={fieldDayHref(d.date, r.resourceId)}
                            className="absolute inset-0 rounded-md hover:bg-paper/70"
                            aria-label={`${r.code} on ${weekdayDate(d.date)}. Open as a list`}
                          />
                          <div className="pointer-events-none relative [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
                            <FieldTimeline
                              row={row}
                              startMin={d.startMin}
                              endMin={d.endMin}
                              nowMin={d.nowMin}
                              size="week"
                              handlers={{ onBlock: (item) => setRemoving(removeTargetFor(item, d.date)) }}
                            />
                          </div>
                        </>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RemoveBlockSheet target={removing} onClose={() => setRemoving(null)} removeAction={removeAction} />
    </>
  );
}
