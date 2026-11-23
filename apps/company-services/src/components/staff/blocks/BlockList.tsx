"use client";

import { useState } from "react";
import type { BlockListItem } from "@tymo/shared/types";
import { RemoveBlockSheet, type RemoveBlockAction, type RemoveTarget } from "./RemoveBlockSheet";

const SECTIONS: { kind: BlockListItem["kind"]; title: string }[] = [
  { kind: "weekly", title: "Every week" },
  { kind: "one_time", title: "One time" },
  { kind: "closure", title: "Closures" },
];

/** Every block, grouped by kind, each with Remove. */
export function BlockList({ blocks, removeAction }: { blocks: BlockListItem[]; removeAction: RemoveBlockAction }) {
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);

  return (
    <>
      <div className="flex flex-col gap-6">
        {SECTIONS.map(({ kind, title }) => {
          const list = blocks.filter((b) => b.kind === kind);
          if (list.length === 0) return null;
          return (
            <section key={kind} aria-labelledby={`blocks-${kind}`}>
              <h2 id={`blocks-${kind}`} className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em] text-muted">
                {title} <span className="font-semibold tabular-nums">· {list.length}</span>
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
                {list.map((b) => (
                  <li key={b.blockId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="grid h-10 w-12 shrink-0 place-items-center rounded-lg bg-paper text-[13px] font-bold text-ink">
                      {b.resourceLabel === "Whole venue" ? "All" : b.resourceLabel}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{b.label}</p>
                      <p className="text-[13.5px] leading-snug text-muted">
                        {b.resourceLabel === "Whole venue" ? "Whole venue · " : ""}
                        {b.summary}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRemoving({
                          blockId: b.blockId,
                          label: b.label,
                          kind: b.kind === "closure" ? "closure" : "block",
                          weekly: b.kind === "weekly",
                        })
                      }
                      className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[14px] font-semibold text-danger hover:bg-[#fbeaec]"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <RemoveBlockSheet target={removing} onClose={() => setRemoving(null)} removeAction={removeAction} />
    </>
  );
}
