"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { cn } from "@tymo/shared/cn";
import type { PlacedItem, RowModel } from "./model";
import { KIND_WORD } from "./model";
import { KIND_CLASS, LABEL_ON_HATCH, kindStyle } from "./styles";

/**
 * Horizontal bars for one field on one day: the parent track plus thin
 * lanes for its halves. Shared by the day grid and the week views.
 */

export interface TimelineHandlers {
  /** Block or closure tapped. */
  onBlock: (item: PlacedItem) => void;
  /** Empty time tapped at `minute` on the field (laneId null) or a half. */
  onEmpty?: (minute: number | null, laneId: string | null) => void;
}

function pctFn(startMin: number, endMin: number) {
  const span = endMin - startMin;
  return (m: number) => ((m - startMin) / span) * 100;
}

function ariaFor(item: PlacedItem) {
  return `${item.timeLabel}, ${item.label}, ${KIND_WORD[item.kind]}${item.full ? "" : `, ${item.scopeCode}`}`;
}

function Segment({
  item,
  left,
  width,
  showLabel,
  compact,
  onBlock,
}: {
  item: PlacedItem;
  left: number;
  width: number;
  showLabel: "always" | "desktop" | "never";
  compact?: boolean;
  onBlock: (item: PlacedItem) => void;
}) {
  const cls = cn(
    "absolute inset-y-0 z-[2] flex items-center overflow-hidden rounded-[5px] text-left text-[11px] font-semibold leading-none",
    KIND_CLASS[item.kind],
    compact ? "" : "px-1.5",
  );
  const style = { left: `${left}%`, width: `max(${width}%, 3px)`, ...kindStyle(item.kind) };
  const label =
    showLabel === "never" ? null : (
      <span className={cn("truncate", showLabel === "desktop" && "hidden lg:block", item.kind === "block" && LABEL_ON_HATCH)}>{item.label}</span>
    );
  const title = ariaFor(item);

  if (item.bookingId && (item.kind === "booking" || item.kind === "request")) {
    return (
      <Link href={`/staff/bookings/${item.bookingId}`} className={cn(cls, "hover:brightness-110 focus-visible:z-10")} style={style} aria-label={title} title={title}>
        {label}
      </Link>
    );
  }
  if (item.blockId && (item.kind === "block" || item.kind === "closure")) {
    return (
      <button type="button" onClick={() => onBlock(item)} className={cn(cls, "focus-visible:z-10")} style={style} aria-label={title} title={title}>
        {label}
      </button>
    );
  }
  return (
    <span className={cls} style={style} title={title} role="img" aria-label={title}>
      {label}
    </span>
  );
}

export function FieldTimeline({
  row,
  startMin,
  endMin,
  nowMin,
  size = "day",
  handlers,
}: {
  row: RowModel;
  startMin: number;
  endMin: number;
  nowMin: number | null;
  /** day: tall tracks with labels on desktop; week: compact, no lanes. */
  size?: "day" | "week";
  handlers: TimelineHandlers;
}) {
  const pct = pctFn(startMin, endMin);
  const visible = row.items.filter((i) => i.visible);
  const split = row.lanes.length > 0;
  const showLanes = split && size === "day";

  function emptyClick(e: MouseEvent<HTMLButtonElement>, laneId: string | null) {
    if (!handlers.onEmpty) return;
    // Keyboard activation has no pointer position: pick the first open time.
    if (e.detail === 0) return handlers.onEmpty(null, laneId);
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    handlers.onEmpty(startMin + ratio * (endMin - startMin), laneId);
  }

  const hours: number[] = [];
  // Week cells are narrow: a line every 3 hours keeps them readable.
  const every = size === "week" ? 3 : 1;
  for (let h = Math.ceil(startMin / 60); h * 60 < endMin; h++) if (h * 60 > startMin && h % every === 0) hours.push(h * 60);

  return (
    <div className="relative">
      {/* hour lines */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
        {hours.map((m) => (
          <span key={m} className="absolute inset-y-0 w-px bg-[#dfe4ec]" style={{ left: `${pct(m)}%` }} />
        ))}
      </div>

      {/* field track */}
      <div className={cn("relative rounded-md bg-paper", size === "day" ? "h-7 lg:h-8" : "h-6")}>
        {handlers.onEmpty ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={(e) => emptyClick(e, null)}
            className="absolute inset-0 cursor-cell rounded-md"
          />
        ) : null}
        {visible.map((item) =>
          item.full || !split ? (
            <Segment
              key={item.id}
              item={item}
              left={pct(item.startMin)}
              width={pct(item.endMin) - pct(item.startMin)}
              showLabel={size === "day" ? "desktop" : "never"}
              onBlock={handlers.onBlock}
            />
          ) : (
            // A half booking marks the field taken: a strip along the bottom.
            <span
              key={item.id}
              aria-hidden
              className={cn("absolute bottom-0 z-[2] h-1.5 rounded-[3px]", KIND_CLASS[item.kind])}
              style={{ left: `${pct(item.startMin)}%`, width: `max(${pct(item.endMin) - pct(item.startMin)}%, 3px)`, ...kindStyle(item.kind) }}
            />
          ),
        )}
      </div>

      {/* half lanes */}
      {showLanes
        ? row.lanes.map((lane) => (
            <div key={lane.resourceId} className="relative mt-1 h-3.5 rounded-[4px] bg-paper lg:h-5">
              {handlers.onEmpty ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={(e) => emptyClick(e, lane.resourceId)}
                  className="absolute inset-0 cursor-cell rounded-[4px]"
                />
              ) : null}
              <span aria-hidden className="pointer-events-none absolute left-1 top-1/2 z-[1] hidden -translate-y-1/2 text-[10px] font-bold text-muted/70 lg:block">
                {lane.code}
              </span>
              {visible
                .filter((i) => i.laneIds.includes(lane.resourceId))
                .map((item) => (
                  <Segment
                    key={item.id}
                    item={item}
                    left={pct(item.startMin)}
                    width={pct(item.endMin) - pct(item.startMin)}
                    showLabel={item.full ? "never" : "desktop"}
                    compact
                    onBlock={handlers.onBlock}
                  />
                ))}
            </div>
          ))
        : null}

      {nowMin !== null && nowMin > startMin && nowMin < endMin ? (
        <span aria-hidden className="pointer-events-none absolute -inset-y-1 z-[3] w-0.5 rounded-full bg-accent" style={{ left: `${pct(nowMin)}%` }} />
      ) : null}
    </div>
  );
}

/** Hour labels above the bars: every 2 hours on phones, every hour on desktop. */
export function HourAxis({ startMin, endMin }: { startMin: number; endMin: number }) {
  const pct = pctFn(startMin, endMin);
  const marks: number[] = [];
  for (let h = Math.ceil(startMin / 60); h * 60 <= endMin; h++) marks.push(h);
  return (
    <div aria-hidden className="relative h-5 text-[10.5px] font-semibold tabular-nums text-muted">
      {marks.map((h) => {
        const edge = h * 60 === startMin ? "translate-x-0" : h * 60 === endMin ? "-translate-x-full" : "-translate-x-1/2";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        const ap = h % 24 < 12 ? "a" : "p";
        return (
          <span
            key={h}
            className={cn("absolute top-0 whitespace-nowrap", edge, (h - Math.ceil(startMin / 60)) % 2 === 1 && "hidden lg:block")}
            style={{ left: `${pct(h * 60)}%` }}
          >
            <span className="lg:hidden">
              {h12}
              {ap}
            </span>
            <span className="hidden lg:inline">
              {h12} {ap === "a" ? "AM" : "PM"}
            </span>
          </span>
        );
      })}
    </div>
  );
}
