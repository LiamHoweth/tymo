"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { BlockInput, BlockPreview, CreateBlockResult } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, CheckboxField, Pill, StatusTag, TextField } from "@/components/ui";
import { SelectField } from "@/components/ui/SelectField";
import { useStaff } from "../StaffProvider";
import { ChevronRight } from "../icons";
import { WEEKDAYS, WEEKDAYS_SHORT, listJoin, plural, shortDate } from "../format";

type Kind = BlockInput["kind"];

export interface BlockFormResource {
  id: string;
  code: string;
  name: string;
  groupLabel: string;
}

const VENUE = "__venue";

const KINDS: { value: Kind; label: string }[] = [
  { value: "one_time", label: "One time" },
  { value: "weekly", label: "Every week" },
  { value: "closure", label: "Closure" },
];

const PLACEHOLDER: Record<Kind, string> = {
  one_time: "Example: Phone booking, paid cash",
  weekly: "Example: High school practice",
  closure: "Example: Thanksgiving",
};

type Errors = Partial<Record<"label" | "resource" | "date" | "times" | "weekdays" | "range", string>>;

function isoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const js = new Date(y, m - 1, d, 12).getDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

function resourceText(r: BlockFormResource) {
  return r.name.startsWith(r.code) ? r.name : `${r.code} · ${r.name}`;
}

/**
 * One form for every block: one time, every week, or closure. A live
 * preview shows what it covers and any bookings in the way; blocks never
 * cancel bookings, so those must be handled first (or skipped, weekly).
 */
export function BlockForm({
  resources,
  initial,
  previewAction,
  createAction,
}: {
  resources: BlockFormResource[];
  initial: { kind: Kind; resourceId: string | null; date: string; start: string; end: string };
  previewAction: (input: BlockInput) => Promise<BlockPreview | null>;
  createAction: (input: BlockInput, skipConflicts: boolean) => Promise<CreateBlockResult>;
}) {
  const router = useRouter();
  const { toast, online } = useStaff();

  const [kind, setKind] = useState<Kind>(initial.kind);
  const [label, setLabel] = useState("");
  const [resource, setResource] = useState<string>(initial.resourceId ?? "");
  const [date, setDate] = useState(initial.date);
  const [endDate, setEndDate] = useState("");
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [allDay, setAllDay] = useState(!initial.start);
  const [weekdays, setWeekdays] = useState<number[]>(initial.date ? [isoWeekday(initial.date)] : []);
  const [untilDate, setUntilDate] = useState("");
  const [publicReason, setPublicReason] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [preview, setPreview] = useState<BlockPreview | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const requestId = useRef(0);

  const venue = kind === "closure" && resource === VENUE;
  const resourceId = venue ? null : resource || null;

  // Everything except the label, which the preview doesn't need.
  const { input, problems } = useMemo(() => {
    const p: Errors = {};
    if (!venue && !resourceId) p.resource = kind === "closure" ? "Pick a field or Whole venue." : "Pick a field.";
    const needTimes = kind !== "closure" || !allDay;
    if (needTimes) {
      if (!start || !end) p.times = "Add a start and end time.";
      else if (end <= start) p.times = "End time must be after the start time.";
    }
    const base = { kind, label: label.trim() || "Block", resourceId } as BlockInput;
    let built: BlockInput;
    if (kind === "weekly") {
      if (weekdays.length === 0) p.weekdays = "Pick at least one day.";
      if (!date || !untilDate) p.range = "Add the first and last dates.";
      else if (untilDate < date) p.range = "The last date must be on or after the first date.";
      built = { ...base, weekdays: [...weekdays].sort(), startDate: date, untilDate, startLocal: start, endLocal: end };
    } else if (kind === "closure") {
      if (!date) p.date = "Pick a date.";
      else if (endDate && endDate < date) p.date = "The end date must be on or after the start date.";
      built = {
        ...base,
        date,
        endDate: endDate || undefined,
        allDay,
        startLocal: allDay ? undefined : start,
        endLocal: allDay ? undefined : end,
        publicReason: publicReason.trim() || undefined,
      };
    } else {
      if (!date) p.date = "Pick a date.";
      built = { ...base, date, startLocal: start, endLocal: end };
    }
    return { input: built, problems: p };
  }, [kind, label, resourceId, venue, date, endDate, start, end, allDay, weekdays, untilDate, publicReason]);

  const complete = Object.keys(problems).length === 0;
  // Preview again only when the time or place changes, not on each label keystroke.
  const previewKey = complete ? JSON.stringify({ ...input, label: "", publicReason: "" }) : "";

  useEffect(() => {
    if (!previewKey) return;
    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setPreviewState("loading");
      try {
        const result = await previewAction(JSON.parse(previewKey) as BlockInput);
        if (id !== requestId.current) return;
        setPreview(result);
        setPreviewState(result ? "idle" : "error");
      } catch {
        if (id === requestId.current) setPreviewState("error");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [previewKey, previewAction]);

  const shownPreview = previewKey ? preview : null;

  function save(skipConflicts: boolean) {
    const all: Errors = { ...problems };
    if (!label.trim()) all.label = "Add a label so staff know what this is.";
    setErrors(all);
    setSaveError(null);
    if (Object.keys(all).length) return;
    const finalInput: BlockInput = { ...input, label: label.trim() };
    startSave(async () => {
      try {
        const r = await createAction(finalInput, skipConflicts);
        if (r.ok) {
          const skipped = r.skippedDates.length ? ` Skipped ${listJoin(r.skippedDates.map(shortDate))}.` : "";
          const what = kind === "closure" ? "Closure saved" : r.savedCount > 1 ? `Block saved for ${r.savedCount} dates` : "Block saved";
          toast(`${what}.${skipped}`, "ok");
          router.push(`/staff/calendar?date=${date}`);
        } else {
          if (r.preview) setPreview(r.preview);
          setSaveError(
            r.message ||
              (r.error === "conflicts" ? "A booking is in the way now. Handle it first, then save." : "Check the field, dates and times."),
          );
        }
      } catch {
        setSaveError("No connection. The block wasn't saved. Try again.");
      }
    });
  }

  const groups = useMemo(() => {
    const map = new Map<string, BlockFormResource[]>();
    for (const r of resources) map.set(r.groupLabel, [...(map.get(r.groupLabel) ?? []), r]);
    return [...map.entries()];
  }, [resources]);

  // Errors appear after a save attempt and clear as soon as each one is fixed.
  const live: Errors = label.trim() ? problems : { ...problems, label: "Add a label so staff know what this is." };
  const err = (k: keyof Errors) => (errors[k] ? live[k] : undefined);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <form
        className="flex flex-col gap-5 rounded-card border border-line bg-white p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        noValidate
      >
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-text">Kind</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Pill
                key={k.value}
                selected={kind === k.value}
                onClick={() => {
                  setKind(k.value);
                  if (k.value !== "closure" && resource === VENUE) setResource("");
                }}
              >
                {k.label}
              </Pill>
            ))}
          </div>
        </fieldset>

        <TextField
          label="Label"
          hint={kind === "closure" ? "Only staff see this. Customers see Closed." : "Only staff see this. Customers see Not available."}
          placeholder={PLACEHOLDER[kind]}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          error={err("label")}
        />

        <SelectField
          label={kind === "closure" ? "Field or venue" : "Field"}
          value={resource}
          onChange={(e) => setResource(e.target.value)}
          error={err("resource")}
          hint={shownPreview?.overlapNote ?? undefined}
        >
          <option value="" disabled>
            Pick a field
          </option>
          {kind === "closure" ? <option value={VENUE}>Whole venue</option> : null}
          {groups.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {resourceText(r)}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>

        {kind === "weekly" ? (
          <>
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-text">Every</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS_SHORT.map((wd, i) => {
                  const n = i + 1;
                  const on = weekdays.includes(n);
                  return (
                    <Pill
                      key={wd}
                      selected={on}
                      aria-label={WEEKDAYS[i]}
                      className="min-w-[3.25rem] px-3"
                      onClick={() => setWeekdays((list) => (on ? list.filter((x) => x !== n) : [...list, n]))}
                    >
                      {wd}
                    </Pill>
                  );
                })}
              </div>
              {err("weekdays") ? (
                <p role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
                  {err("weekdays")}
                </p>
              ) : null}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Starts" type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} />
              <TextField label="Ends" type="time" step={1800} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            {err("times") ? <FieldError>{err("times")}</FieldError> : null}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="First date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <TextField label="Last date" type="date" value={untilDate} min={date || undefined} onChange={(e) => setUntilDate(e.target.value)} />
            </div>
            {err("range") ? <FieldError>{err("range")}</FieldError> : null}
          </>
        ) : null}

        {kind === "one_time" ? (
          <>
            <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={err("date")} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Starts" type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} />
              <TextField label="Ends" type="time" step={1800} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            {err("times") ? <FieldError>{err("times")}</FieldError> : null}
          </>
        ) : null}

        {kind === "closure" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <TextField label="Through" optional type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {err("date") ? <FieldError>{err("date")}</FieldError> : null}
            <CheckboxField label="All day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            {!allDay ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="From" type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} />
                  <TextField label="Until" type="time" step={1800} value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
                {err("times") ? <FieldError>{err("times")}</FieldError> : null}
              </>
            ) : null}
            <TextField
              label="Reason customers see"
              optional
              placeholder="Example: Closed for Thanksgiving"
              hint="Shown on your booking page for these dates. Leave it empty to show just Closed."
              value={publicReason}
              maxLength={120}
              onChange={(e) => setPublicReason(e.target.value)}
            />
          </>
        ) : null}

        <button type="submit" className="sr-only">
          Save
        </button>
      </form>

      <PreviewPanel
        kind={kind}
        weekdays={weekdays}
        complete={complete}
        preview={shownPreview}
        state={previewState}
        saving={saving}
        online={online}
        saveError={saveError}
        onSave={save}
        backHref={`/staff/calendar?date=${date || initial.date}`}
      />
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="-mt-3 text-[13px] font-medium text-danger">
      {children}
    </p>
  );
}

function PreviewPanel({
  kind,
  weekdays,
  complete,
  preview,
  state,
  saving,
  online,
  saveError,
  onSave,
  backHref,
}: {
  kind: Kind;
  weekdays: number[];
  complete: boolean;
  preview: BlockPreview | null;
  state: "idle" | "loading" | "error";
  saving: boolean;
  online: boolean;
  saveError: string | null;
  onSave: (skipConflicts: boolean) => void;
  backHref: string;
}) {
  const conflicts = preview?.conflicts ?? [];
  const weeklySkip = kind === "weekly" && conflicts.length > 0;
  const remaining = preview ? preview.occurrenceCount - preview.conflictDates.length : 0;
  const dayWord = weekdays.length === 1 ? WEEKDAYS[weekdays[0] - 1] : "date";

  let saveLabel = kind === "closure" ? "Save closure" : kind === "weekly" && preview ? `Save ${plural(preview.occurrenceCount, "date")}` : "Save block";
  let canSave = complete && !saving && online;
  let skip = false;
  if (preview && conflicts.length > 0) {
    if (weeklySkip && preview.canSaveSkippingConflicts) {
      saveLabel = `Save ${plural(remaining, "date")}`;
      skip = true;
    } else {
      canSave = false;
    }
  }

  return (
    <aside aria-live="polite" className="ink-card rounded-card p-5 sm:p-6 lg:sticky lg:top-20">
      <p className="kicker text-white/60">What this blocks</p>

      {!complete ? (
        <p className="mt-3 text-[15px] leading-snug text-white/70">Fill in the field, dates and times to see what this covers.</p>
      ) : state === "error" && !preview ? (
        <p className="mt-3 text-[15px] leading-snug text-[#ffb3bc]">Couldn&apos;t check this block. Check your connection; it will try again when you change something.</p>
      ) : !preview ? (
        <p className="mt-3 text-[15px] text-white/70">Checking…</p>
      ) : (
        <div className={cn("mt-3 transition-opacity", state === "loading" && "opacity-60")}>
          <p className="text-[18px] font-semibold leading-snug">{preview.summary}</p>
          {preview.overlapNote ? <p className="mt-1.5 text-[14px] text-white/70">{preview.overlapNote}</p> : null}

          {conflicts.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-white p-4 text-text">
              <p className="text-[14.5px] font-semibold leading-snug text-ink">
                {weeklySkip
                  ? `${plural(preview.conflictDates.length, dayWord)} overlap bookings: ${listJoin(preview.conflictDates.map(shortDate))}. Save the other ${remaining}?`
                  : `${conflicts.length === 1 ? "1 booking is" : `${conflicts.length} bookings are`} in the way.`}
              </p>
              <p className="mt-1 text-[13.5px] leading-snug text-muted">
                {weeklySkip
                  ? "Those dates stay open for their bookings."
                  : "Blocks never cancel bookings. Open each one to cancel or decline it, then save."}
              </p>
              <ul className="mt-3 divide-y divide-line">
                {conflicts.map((c) => (
                  <li key={`${c.bookingId}-${c.occurrenceDate ?? ""}`}>
                    <Link href={`/staff/bookings/${c.bookingId}`} className="flex min-h-14 items-center gap-3 py-2.5 hover:bg-paper/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-semibold text-ink">{c.customerName}</span>
                        <span className="block text-[13px] leading-snug text-muted">
                          {c.resourceLabel} · {c.whenLabel} · {formatCents(c.priceCents)}
                        </span>
                      </span>
                      <StatusTag tone={c.status === "requested" ? "warn" : "ok"}>{c.status === "requested" ? "Requested" : "Approved"}</StatusTag>
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {saveError ? (
        <p role="alert" className="mt-4 text-[14px] font-medium text-[#ffb3bc]">
          {saveError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        <Button variant="accent" block disabled={!canSave} onClick={() => onSave(skip)}>
          {saving ? "Saving…" : saveLabel}
        </Button>
        <Link href={backHref} className="inline-flex min-h-11 items-center justify-center rounded-full text-[14.5px] font-semibold text-white/75 hover:text-white">
          {weeklySkip ? "Go back" : "Cancel"}
        </Link>
      </div>
    </aside>
  );
}
