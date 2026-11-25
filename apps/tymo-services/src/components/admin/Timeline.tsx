import type { AdminTimelineEntry } from "@tymo/company/admin";

/** What happened to a booking, oldest first: time · label · actor · reason. */
export function Timeline({ entries }: { entries: AdminTimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="px-4 py-3 text-[14px] text-muted">No events recorded for this booking.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      {entries.map((entry, i) => (
        <li
          key={`${entry.at}-${i}`}
          className="grid gap-x-4 gap-y-0.5 px-4 py-3 text-[14px] leading-snug md:grid-cols-[15rem_minmax(0,1fr)]"
        >
          <time dateTime={entry.at} className="text-[13px] tabular-nums text-muted md:text-[14px]">
            {entry.atLabel}
          </time>
          <div className="min-w-0">
            <p>
              <span className="font-semibold text-text">{entry.label}</span>
              <span className="text-muted"> · {entry.actor}</span>
            </p>
            {entry.reason ? <p className="mt-0.5 text-text wrap-anywhere">Reason: {entry.reason}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
