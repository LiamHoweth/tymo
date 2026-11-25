import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@tymo/platform/auth/admin-session";
import { getAdminBooking } from "@tymo/company/admin";
import { formatCents, formatPhone } from "@tymo/shared/format";
import { BackLink, ExternalLink } from "@/components/admin/controls";
import { DetailList, DetailRow } from "@/components/admin/DetailList";
import { Note, PageFrame, PageHeader, Panel } from "@/components/admin/Panel";
import { StatusMark } from "@/components/admin/StatusMark";
import { Timeline } from "@/components/admin/Timeline";

export const metadata: Metadata = { title: "Booking", robots: { index: false } };

export default async function AdminBookingPage(props: PageProps<"/admin/bookings/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const booking = await getAdminBooking(id);
  if (!booking) notFound();

  const tel = booking.customerPhone.replace(/[^\d+]/g, "");
  const hasNotes = Boolean(booking.declineReason || booking.cancelReason || booking.staffNotes);

  return (
    <PageFrame>
      <PageHeader
        before={
          <>
            <BackLink href="/admin">All requests</BackLink>
            <p className="mb-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
              <StatusMark tone={booking.tone}>{booking.statusLabel}</StatusMark>
              <span aria-hidden className="h-4 w-px bg-line" />
              <span className="text-muted">{booking.facilityName}</span>
            </p>
          </>
        }
        title={
          <>
            {booking.resourceName}
            <span className="ml-2 font-normal text-muted">{booking.resourceCode}</span>
          </>
        }
        description={<span className="text-[15px] text-text">{booking.whenLabel}</span>}
      />

      <Note className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span>Read-only. Approve, decline and refund from the facility&apos;s staff app.</span>
        <ExternalLink href={booking.staffAppUrl} className="shrink-0 self-start sm:self-auto">
          Open in staff app
        </ExternalLink>
      </Note>

      {/* DOM order matches the phone stack: Customer, Booking, Payment, Notes. Two columns from lg. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Panel title="Customer" id="customer">
            <DetailList>
              <DetailRow label="Name">{booking.customerName}</DetailRow>
              <DetailRow label="Email">
                <a href={`mailto:${booking.customerEmail}`} className="underline decoration-line underline-offset-4 hover:decoration-text">
                  {booking.customerEmail}
                </a>
              </DetailRow>
              <DetailRow label="Phone">
                {tel ? (
                  <a href={`tel:${tel}`} className="tabular-nums underline decoration-line underline-offset-4 hover:decoration-text">
                    {formatPhone(booking.customerPhone)}
                  </a>
                ) : (
                  <span className="text-muted">None on file</span>
                )}
              </DetailRow>
              <DetailRow label="Team">{booking.team ?? <span className="text-muted">None</span>}</DetailRow>
            </DetailList>
          </Panel>

          <Panel title="Booking" id="booking">
            <DetailList>
              <DetailRow label="Field">
                {booking.resourceCode} · {booking.resourceName}
              </DetailRow>
              <DetailRow label="When">{booking.whenLabel}</DetailRow>
              <DetailRow label="Source">{booking.source === "online" ? "Online" : "Staff"}</DetailRow>
              <DetailRow label="Waiver accepted">{booking.waiverAccepted ? "Yes" : "No"}</DetailRow>
              <DetailRow label="Requested">{booking.requestedLabel}</DetailRow>
              <DetailRow label="Approval deadline">
                {booking.approvalDeadlineLabel ?? <span className="text-muted">None</span>}
                {booking.deadlineLabel ? (
                  <span className={booking.urgent ? "block font-semibold text-danger" : "block text-muted"}>
                    {booking.deadlineLabel}
                  </span>
                ) : null}
              </DetailRow>
              <DetailRow label="Decided">{booking.decidedLabel ?? <span className="text-muted">Not yet</span>}</DetailRow>
              <DetailRow label="Booking ID">
                <span className="font-mono text-[13px]">{booking.bookingId}</span>
              </DetailRow>
            </DetailList>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Payment" id="payment">
            <DetailList>
              <DetailRow label="Amount">
                <span className="font-semibold tabular-nums">{formatCents(booking.priceCents)}</span>
              </DetailRow>
              <DetailRow label="Card">{booking.cardLabel ?? <span className="text-muted">No card on file</span>}</DetailRow>
              <DetailRow label="Payment status">{booking.paymentStatusLabel}</DetailRow>
              <DetailRow label="Captured">
                <span className="tabular-nums">{formatCents(booking.amountCapturedCents)}</span>
              </DetailRow>
              <DetailRow label="Refunded">
                <span className="tabular-nums">{formatCents(booking.amountRefundedCents)}</span>
              </DetailRow>
              <DetailRow label="Tymo fee">
                {booking.applicationFeeCents === null ? (
                  <span className="text-muted">None</span>
                ) : (
                  <span className="tabular-nums">{formatCents(booking.applicationFeeCents)}</span>
                )}
              </DetailRow>
            </DetailList>
          </Panel>

          {hasNotes ? (
            <Panel title="Notes and reasons" id="notes">
              <DetailList>
                {booking.declineReason ? <DetailRow label="Decline reason">{booking.declineReason}</DetailRow> : null}
                {booking.cancelReason ? <DetailRow label="Cancel reason">{booking.cancelReason}</DetailRow> : null}
                {booking.staffNotes ? (
                  <DetailRow label="Staff notes">
                    <span className="whitespace-pre-line">{booking.staffNotes}</span>
                  </DetailRow>
                ) : null}
              </DetailList>
            </Panel>
          ) : null}
        </div>
      </div>

      <Panel title="Timeline" id="timeline" className="mt-4">
        <Timeline entries={booking.timeline} />
      </Panel>
    </PageFrame>
  );
}
