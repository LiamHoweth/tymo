"use client";

import { useState, useTransition } from "react";
import type { SettingsView } from "@/lib/types";
import { formatDuration, formatRate } from "@/lib/format";
import { Button } from "@/components/ui";
import { useStaff } from "../StaffProvider";

type Resource = SettingsView["resources"][number];
type Result = { ok: boolean; message: string };

/** Fields and prices, grouped. Owners edit a price in place. */
export function PriceTable({
  resources,
  canEdit,
  updateAction,
}: {
  resources: Resource[];
  canEdit: boolean;
  updateAction: (resourceId: string, priceCentsPerHour: number) => Promise<Result>;
}) {
  const groups = new Map<string, Resource[]>();
  for (const r of resources) groups.set(r.groupLabel, [...(groups.get(r.groupLabel) ?? []), r]);

  if (resources.length === 0) {
    return <p className="px-4 py-6 text-[14.5px] text-muted sm:px-5">No fields yet. Tymo adds your fields during setup.</p>;
  }

  return (
    <div>
      {[...groups.entries()].map(([group, list]) => (
        <div key={group}>
          <h3 className="border-y border-line bg-paper/60 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.1em] text-muted first:border-t-0 sm:px-5">
            {group}
          </h3>
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <PriceRow key={r.id} resource={r} canEdit={canEdit} updateAction={updateAction} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PriceRow({ resource, canEdit, updateAction }: { resource: Resource; canEdit: boolean; updateAction: (id: string, cents: number) => Promise<Result> }) {
  const { toast, online } = useStaff();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `price-${resource.id}`;

  function start() {
    setValue((resource.priceCentsPerHour / 100).toFixed(resource.priceCentsPerHour % 100 ? 2 : 0));
    setError(null);
    setEditing(true);
  }

  function save() {
    const clean = value.replace(/[$,\s]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
      setError("Enter a price like 45 or 45.50.");
      return;
    }
    const cents = Math.round(Number(clean) * 100);
    if (cents < 100) {
      setError("The price must be at least $1 an hour.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const r = await updateAction(resource.id, cents);
        if (r.ok) {
          setEditing(false);
          toast(r.message || `${resource.code} is now ${formatRate(cents)}.`, "ok");
        } else setError(r.message);
      } catch {
        setError("No connection. The price didn't change.");
      }
    });
  }

  const name = resource.name.startsWith(resource.code) ? resource.name : `${resource.code} · ${resource.name}`;

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
          <p className="text-[13px] text-muted">
            {formatDuration(resource.minMinutes)} to {formatDuration(resource.maxMinutes)}, in {resource.slotMinutes}-minute steps
          </p>
        </div>
        {!editing ? (
          <>
            <p className="shrink-0 text-[15px] font-bold tabular-nums text-ink">{formatRate(resource.priceCentsPerHour)}</p>
            {canEdit ? (
              <button
                type="button"
                onClick={start}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[14px] font-semibold text-brand hover:bg-paper"
                aria-label={`Edit price for ${resource.code}`}
              >
                Edit
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {editing ? (
        <form
          className="mt-3 flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Price per hour for {resource.code}
          </label>
          <div className="relative w-36">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-muted">$</span>
            <input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={error ? true : undefined}
              className="h-11 w-full rounded-xl border-[1.5px] border-line bg-white pl-7 pr-11 text-[16px] tabular-nums outline-none focus:border-brand"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">/hr</span>
          </div>
          <Button type="submit" variant="ink" size="sm" className="min-h-11 px-5" disabled={pending || !online}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" size="sm" className="min-h-11 px-4" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
          {error ? (
            <p role="alert" className="w-full text-[13px] font-medium text-danger">
              {error}
            </p>
          ) : (
            <p className="w-full text-[13px] text-muted">New requests use the new price. Existing bookings keep theirs.</p>
          )}
        </form>
      ) : null}
    </li>
  );
}
