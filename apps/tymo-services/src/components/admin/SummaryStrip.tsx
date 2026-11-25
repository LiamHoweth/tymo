import type { ReactNode } from "react";
import type { AdminOverview } from "@tymo/company/admin";

/** Four counts across every facility, separated by hairlines (the 1px gap shows the line color). */
export function SummaryStrip({ overview }: { overview: AdminOverview }) {
  const items: { label: string; value: ReactNode }[] = [
    { label: "Waiting for approval", value: overview.waiting },
    { label: "Due within 24 hr", value: overview.dueWithin24h },
    { label: "Booked, upcoming", value: overview.bookedUpcoming },
    {
      label: "Facilities taking bookings",
      value: (
        <>
          {overview.facilitiesTakingBookings}
          <span className="ml-1.5 text-[15px] font-normal text-muted">of {overview.facilities}</span>
        </>
      ),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col justify-between gap-2 bg-card px-4 py-3">
          <dt className="text-[13px] leading-snug text-muted">{item.label}</dt>
          <dd className="text-[24px] font-semibold leading-none tabular-nums text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
