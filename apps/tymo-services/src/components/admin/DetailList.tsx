import type { ReactNode } from "react";

/** Label/value rows with hairline dividers, for the booking detail sections. */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line">{children}</dl>;
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,38%)_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[14px] leading-snug">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-text wrap-anywhere">{children}</dd>
    </div>
  );
}
