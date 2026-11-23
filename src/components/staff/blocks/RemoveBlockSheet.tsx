"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button, Sheet } from "@/components/ui";
import { useStaff } from "../StaffProvider";
import { weekdayDate } from "../format";

export type RemoveScope = "this" | "following" | "all";
export type RemoveBlockAction = (
  blockId: string,
  scope: RemoveScope,
  occurrenceDate?: string,
) => Promise<{ ok: boolean; message: string }>;

export interface RemoveTarget {
  blockId: string;
  label: string;
  kind: "block" | "closure";
  /** Set when removing from one date of the calendar. */
  date?: string;
  /** Weekly series: offer "This date only" / "This and later dates" / "Whole series". */
  weekly: boolean;
  /** "N1" and "3:00 to 5:30 PM" for the "opens for booking" line. */
  code?: string;
  timeLabel?: string;
}

const SCOPES: { value: RemoveScope; label: string }[] = [
  { value: "this", label: "This date only" },
  { value: "following", label: "This and later dates" },
  { value: "all", label: "Whole series" },
];

/** "Remove Westside practice on Mon Feb 15?" with the series scope choice. */
export function RemoveBlockSheet({
  target,
  onClose,
  removeAction,
}: {
  target: RemoveTarget | null;
  onClose: () => void;
  removeAction: RemoveBlockAction;
}) {
  const { toast, online } = useStaff();
  const [scope, setScope] = useState<RemoveScope>("this");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only one date of a weekly series can be removed on its own; anything
  // else removes the whole block (past dates never change).
  const showScopes = Boolean(target?.weekly && target?.date);
  const noun = target?.kind === "closure" ? "closure" : "block";

  function close() {
    setScope("this");
    setError(null);
    onClose();
  }

  function submit() {
    if (!target) return;
    const chosen: RemoveScope = showScopes ? scope : "all";
    setError(null);
    startTransition(async () => {
      try {
        const r = await removeAction(target.blockId, chosen, showScopes ? target.date : undefined);
        if (r.ok) {
          toast(r.message || `${noun === "closure" ? "Closure" : "Block"} removed.`, "ok");
          close();
        } else {
          setError(r.message || `Couldn't remove this ${noun}. Try again.`);
        }
      } catch {
        setError(`No connection. The ${noun} is still there. Try again.`);
      }
    });
  }

  let title = "Remove block?";
  let body = "";
  if (target) {
    title = showScopes && target.date ? `Remove ${target.label} on ${weekdayDate(target.date)}?` : `Remove ${target.label}?`;
    if (target.date) {
      body =
        target.kind === "closure" || !target.code
          ? "That time opens for booking again."
          : `${target.code} opens for booking ${target.timeLabel ?? ""}.`.replace(" .", ".");
    } else {
      body = target.weekly ? "Its upcoming dates open for booking. Past dates don't change." : "That time opens for booking again.";
    }
  }

  return (
    <Sheet open={target !== null} onClose={close} title={title}>
      {target ? (
        <div className="flex flex-col gap-5">
          <p className="text-[15px] leading-snug text-muted">{body}</p>

          {showScopes ? (
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-text">Which dates?</legend>
              <div className="flex flex-col gap-2">
                {SCOPES.map((s) => (
                  <label
                    key={s.value}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-4 text-[15px] font-medium",
                      scope === s.value ? "border-ink bg-paper" : "border-line",
                    )}
                  >
                    <input
                      type="radio"
                      name="remove-scope"
                      value={s.value}
                      checked={scope === s.value}
                      onChange={() => setScope(s.value)}
                      className="h-5 w-5 accent-[var(--ink)]"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-muted">Past dates don&apos;t change.</p>
            </fieldset>
          ) : null}

          {error ? (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="ink" block onClick={submit} disabled={pending || !online}>
              {pending ? "Removing…" : `Remove ${noun}`}
            </Button>
            <Button variant="ghost" block onClick={close}>
              Keep {noun}
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
