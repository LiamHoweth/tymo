"use client";

import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui";
import { formatCents, formatDuration } from "@/lib/format";
import type { ContinueState } from "./action-types";
import { ArrowRight } from "./icons";
import { SummaryBar, barButtonClass } from "./SummaryBar";
import { compactRange } from "./time";
import { useTimeSelection } from "./TimeSelection";

/**
 * Sticky bar on Date and time: "Sat, Dec 5 · 5:00–6:30 PM CT · $120.00"
 * and Continue, which soft-holds the slot (startCheckout). "Just taken"
 * and other refusals show right above the button.
 */
export function TimeSummary({
  action,
  resourceId,
  resourceName,
  date,
  dateLabel,
  durationMinutes,
  zoneLabel,
}: {
  action: (prev: ContinueState, data: FormData) => Promise<ContinueState>;
  resourceId: string;
  resourceName: string;
  date: string;
  dateLabel: string;
  durationMinutes: number;
  zoneLabel: string;
}) {
  const { picked } = useTimeSelection();
  const [state, formAction, pending] = useActionState(action, { error: null, attempt: 0 });

  // A new pick dismisses the last refusal; losing a pick (slot taken) keeps it.
  const [seen, setSeen] = useState({ picked, dismissed: 0 });
  if (seen.picked !== picked) {
    setSeen({ picked, dismissed: picked ? state.attempt : seen.dismissed });
  }
  const error = state.error && state.attempt > seen.dismissed ? state.error : null;

  const slot = picked?.slot;
  const range = slot ? compactRange(slot.startLocal, slot.endLocal) : null;

  return (
    <form action={formAction}>
      <input type="hidden" name="resourceId" value={resourceId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="durationMinutes" value={durationMinutes} />
      <input type="hidden" name="startsAt" value={slot?.startsAt ?? ""} />
      <input type="hidden" name="startLocal" value={slot?.startLocal ?? ""} />
      <input type="hidden" name="endLocal" value={slot?.endLocal ?? ""} />
      <SummaryBar
        title={resourceName}
        when={
          slot && range ? (
            <>
              <span className="whitespace-nowrap">{picked.dateLabel}</span> ·{" "}
              <span className="whitespace-nowrap">
                {range} {zoneLabel}
              </span>
            </>
          ) : (
            <>
              {dateLabel} · {formatDuration(durationMinutes)}
            </>
          )
        }
        price={slot ? formatCents(slot.priceCents) : <span className="text-[16px] font-semibold text-white/70 lg:text-[18px]">Pick a start time</span>}
        priceNote={slot ? "Charged only when the front desk confirms." : null}
        message={
          error ? (
            <p role="alert" className="rounded-xl bg-white/10 px-3 py-2 text-[14px] font-medium leading-snug text-white">
              {error}
            </p>
          ) : null
        }
        action={
          <button
            type="submit"
            disabled={!slot}
            aria-disabled={pending || undefined}
            onClick={(e) => {
              if (pending) e.preventDefault();
            }}
            className={buttonClass({ variant: "accent", size: "md" }, barButtonClass)}
          >
            {pending ? "Holding..." : "Continue"}
            {pending ? null : <ArrowRight className="h-[18px] w-[18px]" />}
          </button>
        }
      />
    </form>
  );
}
