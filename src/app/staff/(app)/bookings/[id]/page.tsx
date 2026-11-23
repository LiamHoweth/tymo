import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import type { BookingStatus } from "@/lib/types";
import { formatCents, formatPhone } from "@/lib/format";
import { requireStaff } from "@/server/auth";
import { getBookingDetail } from "@/server/booking/staff";
import { StatusTag, buttonClass } from "@/components/ui";
import { Card, DetailRow, PageHeader, SectionTitle } from "@/components/staff/Page";
import { MailIcon, PhoneIcon } from "@/components/staff/icons";
import { BookingActionPanel } from "@/components/staff/booking/BookingActionPanel";
import { NotesForm } from "@/components/staff/booking/NotesForm";
import { ResendLinkButton } from "@/components/staff/booking/ResendLinkButton";
import { facilityTimeZone } from "../../_lib/facility";
import { declineRequestAction } from "../../actions";
import { cancelBookingAction, resendLinkAction, saveNotesAction } from "../actions";

export const metadata: Metadata = { title: "Booking" };

function tone(status: BookingStatus) {
  if (status === "requested") return "warn" as const;
  if (status === "approved" || status === "completed") return "ok" as const;
  if (status === "payment_failed") return "danger" as const;
  return "neutral" as const;
}

export default async function BookingDetailPage(props: PageProps<"/staff/bookings/[id]">) {
  const session = await requireStaff();
  const { id } = await props.params;
  const detail = await getBookingDetail(session, id);
  if (!detail) notFound();

  const zone = await facilityTimeZone(session);
  const dateShort = DateTime.fromISO(detail.startsAt, { zone }).toFormat("ccc LLL d");
  const tel = detail.customer.phone.replace(/[^\d+]/g, "");
  const isOwner = detail.tymoFeeCents !== null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ href: detail.status === "requested" ? "/staff" : `/staff/calendar?date=${DateTime.fromISO(detail.startsAt, { zone }).toISODate()}`, label: detail.status === "requested" ? "Approvals" : "Calendar" }}
        kicker={
          <span className="flex flex-wrap items-center gap-2">
            <StatusTag tone={tone(detail.status)}>{detail.statusLabel}</StatusTag>
            <span>{detail.resourceLabel}</span>
          </span>
        }
        title={[{ text: detail.customer.name }]}
        sub={<span className="font-semibold text-ink">{detail.whenLabel}</span>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1">
          <BookingActionPanel detail={detail} dateShort={dateShort} declineAction={declineRequestAction} cancelAction={cancelBookingAction} />
          <Card className="p-4 sm:p-5">
            <NotesForm bookingId={detail.bookingId} initial={detail.staffNotes ?? ""} saveAction={saveNotesAction} />
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <Card className="p-4 sm:p-5">
            <SectionTitle>Customer</SectionTitle>
            <p className="text-[16px] font-semibold text-ink">{detail.customer.name}</p>
            {detail.team ? <p className="text-[14.5px] text-muted">{detail.team}</p> : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a href={`tel:${tel}`} className={buttonClass({ variant: "ghost", size: "sm" }, "min-h-11 justify-start px-4 sm:justify-center")}>
                <PhoneIcon className="h-4 w-4" />
                <span className="sr-only">Call </span>
                {formatPhone(detail.customer.phone)}
              </a>
              <a
                href={`mailto:${detail.customer.email}`}
                className={buttonClass({ variant: "ghost", size: "sm" }, "min-h-11 min-w-0 justify-start px-4 sm:justify-center")}
              >
                <MailIcon className="h-4 w-4" />
                <span className="sr-only">Email </span>
                <span className="truncate">{detail.customer.email}</span>
              </a>
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13.5px] leading-snug text-muted">Their private link shows the booking and lets them cancel.</p>
              <ResendLinkButton bookingId={detail.bookingId} email={detail.customer.email} resendAction={resendLinkAction} />
            </div>
          </Card>

          <Card className="px-4 py-2 sm:px-5">
            <dl className="divide-y divide-line">
              <DetailRow label="Field">{detail.resourceLabel}</DetailRow>
              <DetailRow label="Time">{detail.whenLabel}</DetailRow>
              {detail.approvalDeadlineLabel && detail.status === "requested" ? (
                <DetailRow label="Approve by">{detail.approvalDeadlineLabel}</DetailRow>
              ) : null}
              {detail.declineReason ? <DetailRow label="Decline reason">{detail.declineReason}</DetailRow> : null}
              {detail.cancelReason ? <DetailRow label="Cancel reason">{detail.cancelReason}</DetailRow> : null}
              <DetailRow label="Waiver">
                {detail.waiverAcceptedLabel ?? <span className="font-medium text-danger">Not accepted</span>}
              </DetailRow>
            </dl>
          </Card>

          <Card className="px-4 py-2 sm:px-5">
            <dl className="divide-y divide-line">
              <DetailRow label="Price">
                <span className="font-semibold tabular-nums">{formatCents(detail.priceCents)}</span>
              </DetailRow>
              <DetailRow label="Card">
                {detail.cardLabel ?? "No card on file"}
                {detail.paymentStatus === "authorized" ? <span className="text-muted"> · held, not charged</span> : null}
              </DetailRow>
              {detail.amountCapturedCents > 0 ? (
                <DetailRow label="Paid">
                  <span className="tabular-nums">{formatCents(detail.amountCapturedCents)}</span>
                </DetailRow>
              ) : null}
              {detail.amountRefundedCents > 0 ? (
                <DetailRow label="Refunded">
                  <span className="tabular-nums">{formatCents(detail.amountRefundedCents)}</span>
                </DetailRow>
              ) : null}
              {isOwner && detail.tymoFeeCents !== null && detail.amountCapturedCents > 0 ? (
                <DetailRow label="Tymo fee (2%)">
                  <span className="tabular-nums">{formatCents(detail.tymoFeeCents)}</span>
                </DetailRow>
              ) : null}
              {isOwner && detail.payoutCents !== null && detail.amountCapturedCents > 0 ? (
                <DetailRow label="Payout">
                  <span className="font-semibold tabular-nums">{formatCents(detail.payoutCents)}</span>
                </DetailRow>
              ) : null}
            </dl>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle>History</SectionTitle>
            {detail.history.length === 0 ? (
              <p className="text-[14.5px] text-muted">Nothing yet.</p>
            ) : (
              <ol className="relative ml-1.5 border-l-2 border-line">
                {detail.history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="relative pb-4 pl-5 last:pb-0">
                    <span aria-hidden className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-ink" />
                    <p className="text-[15px] font-semibold leading-snug text-ink">{h.action}</p>
                    <p className="text-[13.5px] text-muted">
                      {h.atLabel} · {h.actor}
                    </p>
                    {h.reason ? <p className="mt-1 text-[14px] leading-snug text-text">&ldquo;{h.reason}&rdquo;</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
