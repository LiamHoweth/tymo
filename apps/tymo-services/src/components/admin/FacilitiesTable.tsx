import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminFacilityRow } from "@tymo/company/admin";
import { cn } from "@tymo/shared/cn";
import { ExternalLink } from "./controls";
import { StatusMark } from "./StatusMark";
import { requestsHref } from "./status";

/** Every facility on Tymo. Stacked blocks below md, a table from md up. */
export function FacilitiesTable({ rows }: { rows: AdminFacilityRow[] }) {
  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.slug} className="border border-line bg-card px-4 pt-3">
            <FacilityName row={row} />
            <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[14px] leading-snug">
              <Line label="Zone">{row.timeZoneLabel}</Line>
              <Line label="Bookings">
                <BookingsMark on={row.bookingsEnabled} />
              </Line>
              <Line label="Payouts">
                <PayoutsMark ready={row.payoutsReady} />
              </Line>
              <Line label="Waiting">
                <span className="tabular-nums">{row.waiting}</span>
              </Line>
              <Line label="Upcoming">
                <span className="tabular-nums">{row.bookedUpcoming}</span>
              </Line>
              <Line label="Staff">
                <span className="tabular-nums">{row.staffCount}</span>
              </Line>
            </dl>
            <div className="mt-2 flex gap-5 border-t border-line text-[14px]">
              <RowLinks row={row} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden border border-line bg-card md:block">
        <table className="w-full border-collapse text-left text-[14px] leading-snug">
          <thead>
            <tr className="border-b border-line">
              <Th className="pl-4">Facility</Th>
              <Th>Zone</Th>
              <Th>Bookings</Th>
              <Th>Payouts</Th>
              <Th className="text-right">Waiting</Th>
              <Th className="text-right">Upcoming</Th>
              <Th className="text-right">Staff</Th>
              <Th className="pr-4">
                <span className="sr-only">Links</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slug} className="border-b border-line align-top last:border-b-0">
                <td className="py-3 pl-4 pr-3">
                  <FacilityName row={row} />
                </td>
                <td className="px-3 py-3">{row.timeZoneLabel}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  <BookingsMark on={row.bookingsEnabled} />
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <PayoutsMark ready={row.payoutsReady} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{row.waiting}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.bookedUpcoming}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.staffCount}</td>
                <td className="py-0 pl-3 pr-4">
                  <div className="flex items-center justify-end gap-4 whitespace-nowrap">
                    <RowLinks row={row} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FacilityName({ row }: { row: AdminFacilityRow }) {
  return (
    <>
      <span className="block font-semibold text-text">{row.name}</span>
      <span className="block text-[13px] text-muted">{row.city ?? "No city on file"}</span>
    </>
  );
}

function BookingsMark({ on }: { on: boolean }) {
  return <StatusMark tone={on ? "good" : "neutral"}>{on ? "On" : "Off"}</StatusMark>;
}

function PayoutsMark({ ready }: { ready: boolean }) {
  return <StatusMark tone={ready ? "good" : "waiting"}>{ready ? "Ready" : "Not set up"}</StatusMark>;
}

/** Requests filtered to this facility, and its public booking page. */
function RowLinks({ row }: { row: AdminFacilityRow }) {
  return (
    <>
      <Link
        href={requestsHref("requested", row.slug)}
        className="inline-flex min-h-11 items-center font-medium text-text underline decoration-line underline-offset-4 hover:decoration-text"
      >
        Requests<span className="sr-only"> at {row.name}</span>
      </Link>
      <ExternalLink href={row.bookingPageUrl}>
        Booking page<span className="sr-only"> for {row.name}</span>
      </ExternalLink>
    </>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("kicker whitespace-nowrap px-3 py-2.5 font-semibold text-muted", className)}>
      {children}
    </th>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-text">{children}</dd>
    </>
  );
}
