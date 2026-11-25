import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminRequestRow, AdminStatusFilter } from "@tymo/company/admin";
import { formatCents } from "@tymo/shared/format";
import { cn } from "@tymo/shared/cn";
import { StatusMark } from "./StatusMark";

/**
 * Requests across facilities. Below md each booking is a stacked block of
 * label/value lines (no sideways scroll at 375px); md and up it's a table.
 * Both open the booking from a real link that leads the row.
 */
export function RequestsTable({ rows, status }: { rows: AdminRequestRow[]; status: AdminStatusFilter }) {
  const showDeadline = status === "requested";
  const lastLabel = showDeadline ? "Deadline" : "Requested";

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li
            key={row.bookingId}
            className="relative border border-line bg-card px-4 pb-3 pt-1 has-[a:focus-visible]:border-accent"
          >
            <RowLink row={row} stretch />
            <dl className="mt-1 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[14px] leading-snug">
              <Line label="Facility">{row.facilityName}</Line>
              <Line label="Field">
                <FieldCell row={row} />
              </Line>
              <Line label="When">{row.whenLabel}</Line>
              <Line label="Customer">
                <CustomerCell row={row} />
              </Line>
              <Line label="Amount">
                <span className="tabular-nums">{formatCents(row.priceCents)}</span>
              </Line>
              <Line label={lastLabel}>{showDeadline ? <Deadline row={row} /> : row.requestedLabel}</Line>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden border border-line bg-card md:block">
        <table className="w-full border-collapse text-left text-[14px] leading-snug">
          <thead>
            <tr className="border-b border-line">
              <Th className="pl-4">Status</Th>
              <Th>Facility</Th>
              <Th>Field</Th>
              <Th>When</Th>
              <Th>Customer</Th>
              <Th className="text-right">Amount</Th>
              <Th className="pr-4">{lastLabel}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.bookingId}
                className="border-b border-line align-top last:border-b-0 hover:bg-paper has-[a:focus-visible]:bg-paper"
              >
                <td className="py-1 pl-4 pr-3">
                  <RowLink row={row} />
                </td>
                <td className="px-3 py-3.5">{row.facilityName}</td>
                <td className="px-3 py-3.5">
                  <FieldCell row={row} />
                </td>
                <td className="min-w-40 px-3 py-3.5">{row.whenLabel}</td>
                <td className="px-3 py-3.5">
                  <CustomerCell row={row} />
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">{formatCents(row.priceCents)}</td>
                <td className="py-3.5 pl-3 pr-4">{showDeadline ? <Deadline row={row} /> : row.requestedLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The status word, as the link to the booking. Screen readers hear which
 * booking it opens. On phones it stretches over the whole block.
 */
function RowLink({ row, stretch = false }: { row: AdminRequestRow; stretch?: boolean }) {
  return (
    <Link
      href={`/admin/bookings/${row.bookingId}`}
      className={cn(
        "inline-flex min-h-11 items-center underline-offset-4 hover:underline",
        stretch && "after:absolute after:inset-0",
      )}
    >
      <StatusMark tone={row.tone}>{row.statusLabel}</StatusMark>
      <span className="sr-only">
        {`: ${row.resourceCode} at ${row.facilityName}, ${row.whenLabel}, for ${row.customerName}`}
      </span>
    </Link>
  );
}

function FieldCell({ row }: { row: AdminRequestRow }) {
  return (
    <>
      <span className="block font-medium text-text">{row.resourceCode}</span>
      <span className="block text-[13px] text-muted">{row.resourceName}</span>
    </>
  );
}

function CustomerCell({ row }: { row: AdminRequestRow }) {
  return (
    <>
      <span className="block font-medium text-text">{row.customerName}</span>
      <span className="block text-[13px] text-muted wrap-anywhere">{row.customerEmail}</span>
      {row.team ? <span className="block text-[13px] text-muted">{row.team}</span> : null}
    </>
  );
}

function Deadline({ row }: { row: AdminRequestRow }) {
  if (!row.deadlineLabel) return <span className="text-muted">None</span>;
  return <span className={cn("tabular-nums", row.urgent ? "font-semibold text-danger" : "text-text")}>{row.deadlineLabel}</span>;
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
