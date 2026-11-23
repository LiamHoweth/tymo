"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { TextAreaField } from "@/components/ui/TextAreaField";

/** Staff-only notes on a booking. Customers never see these. */
export function NotesForm({
  bookingId,
  initial,
  saveAction,
}: {
  bookingId: string;
  initial: string;
  saveAction: (bookingId: string, notes: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = notes.trim() !== saved.trim();

  function save() {
    setStatus(null);
    startTransition(async () => {
      try {
        const r = await saveAction(bookingId, notes);
        if (r.ok) {
          setSaved(notes);
          setStatus({ tone: "ok", text: "Saved" });
        } else {
          setStatus({ tone: "error", text: r.message });
        }
      } catch {
        setStatus({ tone: "error", text: "No connection. Your notes aren't saved yet." });
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-3"
    >
      <TextAreaField
        label="Staff notes"
        hint="Only staff see these."
        placeholder="Example: Coach asked for the goals on the south end."
        value={notes}
        maxLength={5000}
        rows={4}
        onChange={(e) => {
          setNotes(e.target.value);
          setStatus(null);
        }}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="ink" size="sm" className="min-h-11 px-5" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
        {status ? (
          <p role={status.tone === "error" ? "alert" : "status"} className={status.tone === "error" ? "text-[13.5px] font-medium text-danger" : "text-[13.5px] font-medium text-ok"}>
            {status.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
