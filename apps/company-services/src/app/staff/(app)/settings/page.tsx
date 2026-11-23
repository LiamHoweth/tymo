import type { Metadata } from "next";
import type { SettingsView } from "@tymo/shared/types";
import { formatDuration, formatPhone } from "@tymo/shared/format";
import { requireStaff } from "@tymo/platform/auth";
import { getSettings } from "@tymo/company/staff";
import { StatusTag, buttonClass } from "@tymo/ui";
import { Card, DetailRow, Notice, PageHeader, SectionTitle } from "@/components/staff/Page";
import { CopyLinkButton } from "@/components/staff/CopyLinkButton";
import { SignOutButton } from "@/components/staff/StaffShell";
import { BookingsSwitch } from "@/components/staff/settings/BookingsSwitch";
import { InviteForm } from "@/components/staff/settings/InviteForm";
import { PriceTable } from "@/components/staff/settings/PriceTable";
import { WEEKDAYS_SHORT, firstName, hhmmLabel } from "@/components/staff/format";
import { setBookingsEnabledAction, signOutAction } from "../actions";
import { inviteStaffAction, updatePriceAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

type Hours = SettingsView["hours"];

/** "Mon to Fri: 7:00 AM to 9:00 PM", consecutive days with the same hours merged. */
function hoursLines(hours: Hours, missing: "closed" | "skip" = "closed"): { days: string; time: string }[] {
  const byDay = new Map<number, string>();
  for (const h of hours) byDay.set(h.weekday, `${hhmmLabel(h.opensAt)} to ${hhmmLabel(h.closesAt)}`);
  const lines: { from: number; to: number; time: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    // Fields inherit venue hours on days they don't set.
    if (!byDay.has(d) && missing === "skip") continue;
    const time = byDay.get(d) ?? "Closed";
    const last = lines[lines.length - 1];
    if (last && last.time === time && last.to === d - 1) last.to = d;
    else lines.push({ from: d, to: d, time });
  }
  return lines.map((l) => ({
    days:
      l.from === l.to
        ? WEEKDAYS_SHORT[l.from - 1]
        : l.to === l.from + 1
          ? `${WEEKDAYS_SHORT[l.from - 1]} and ${WEEKDAYS_SHORT[l.to - 1]}`
          : `${WEEKDAYS_SHORT[l.from - 1]} to ${WEEKDAYS_SHORT[l.to - 1]}`,
    time: l.time,
  }));
}

export default async function SettingsPage() {
  const session = await requireStaff();
  const settings = await getSettings(session);
  const { facility, payouts, canEdit } = settings;
  const owner = settings.staff.find((s) => s.role === "owner");
  const ownerName = owner ? firstName(owner.name) : "the owner";
  const payoutsReady = payouts.connected && payouts.chargesEnabled && payouts.detailsSubmitted;
  const bookingLink = `/book/${facility.slug}`;

  const venueHours = settings.hours.filter((h) => h.resourceId === null);
  const fieldHours = new Map<string, Hours>();
  for (const h of settings.hours) if (h.resourceId) fieldHours.set(h.resourceId, [...(fieldHours.get(h.resourceId) ?? []), h]);
  const codeOf = (id: string) => settings.resources.find((r) => r.id === id)?.code ?? "Field";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={[{ text: "Settings" }]} sub={canEdit ? undefined : `You can see everything here. ${ownerName} (owner) makes changes.`} />

      {!facility.bookingsEnabled && !payoutsReady ? (
        <Notice
          tone="warn"
          title="Bookings are off until payouts are set up."
          className="mb-5"
          action={
            canEdit ? (
              <a href="/api/stripe/connect/start" className={buttonClass({ variant: "ink", size: "sm" }, "min-h-11")}>
                {payouts.connected ? "Finish payout setup" : "Connect payouts"}
              </a>
            ) : undefined
          }
        >
          {canEdit ? null : `Ask ${ownerName} to finish payout setup.`}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-5">
        <Card className="p-4 sm:p-5">
          <SectionTitle>Booking page</SectionTitle>
          {canEdit ? (
            <BookingsSwitch enabled={facility.bookingsEnabled} enableAction={setBookingsEnabledAction} />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-semibold text-ink">Take bookings online</p>
              <StatusTag tone={facility.bookingsEnabled ? "ok" : "neutral"}>{facility.bookingsEnabled ? "On" : "Off"}</StatusTag>
            </div>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-[13px] font-semibold text-text">Your booking link</p>
            <CopyLinkButton link={bookingLink} />
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle
            aside={
              <StatusTag tone={payoutsReady ? "ok" : payouts.connected ? "warn" : "neutral"}>
                {payoutsReady ? "Connected" : payouts.connected ? "Needs details" : "Not connected"}
              </StatusTag>
            }
          >
            Payouts
          </SectionTitle>
          <p className="text-[14.5px] leading-snug text-muted">
            {payoutsReady
              ? "Stripe pays approved bookings to your bank. Payout history is in your Stripe Dashboard."
              : payouts.connected
                ? "Stripe needs a few more details before it can pay you."
                : "Connect a bank account through Stripe so approved bookings pay out to you."}
          </p>
          {canEdit ? (
            <div className="mt-4">
              {payoutsReady ? (
                <a
                  href="https://dashboard.stripe.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "ghost", size: "sm" }, "min-h-11 px-5")}
                >
                  Open Stripe Dashboard
                </a>
              ) : (
                <a href="/api/stripe/connect/start" className={buttonClass({ variant: "ink", size: "sm" }, "min-h-11 px-5")}>
                  {payouts.connected ? "Finish payout setup" : "Connect payouts"}
                </a>
              )}
            </div>
          ) : !payoutsReady ? (
            <p className="mt-3 text-[14px] font-medium text-text">Ask {ownerName} to finish payout setup.</p>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 pb-1 sm:p-5 sm:pb-1">
            <SectionTitle id="prices" aside={canEdit ? undefined : "Owner edits prices"}>
              Fields and prices
            </SectionTitle>
          </div>
          <PriceTable resources={settings.resources} canEdit={canEdit} updateAction={updatePriceAction} />
          <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">
            Adding a field or changing halves goes through Tymo for now.
          </p>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle>Hours</SectionTitle>
          {venueHours.length === 0 ? (
            <p className="text-[14.5px] text-muted">No hours set yet.</p>
          ) : (
            <dl className="divide-y divide-line">
              {hoursLines(venueHours).map((l) => (
                <div key={l.days} className="flex justify-between gap-4 py-2.5 text-[15px]">
                  <dt className="font-semibold text-ink">{l.days}</dt>
                  <dd className={l.time === "Closed" ? "text-muted" : "tabular-nums text-text"}>{l.time}</dd>
                </div>
              ))}
            </dl>
          )}
          {[...fieldHours.entries()].map(([id, list]) => (
            <div key={id} className="mt-4 rounded-xl bg-paper px-3.5 py-2.5">
              <p className="text-[13px] font-bold text-ink">{codeOf(id)} has its own hours</p>
              {hoursLines(list, "skip").map((l) => (
                <p key={l.days} className="text-[13.5px] text-muted">
                  {l.days}: {l.time}
                </p>
              ))}
            </div>
          ))}
          <p className="mt-3 text-[13px] text-muted">
            {fieldHours.size ? "Other days follow the venue hours. " : ""}To change hours, ask Tymo. Times are in {facility.timeZoneLabel}.
          </p>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle>Rules</SectionTitle>
          <dl className="divide-y divide-line">
            <DetailRow label="Booking window">{facility.bookingWindowDays} days ahead</DetailRow>
            <DetailRow label="Notice needed">{formatDuration(facility.leadTimeMinutes)} before start</DetailRow>
            <DetailRow label="Free cancellation">Until {formatDuration(facility.cancelCutoffMinutes)} before start</DetailRow>
            <DetailRow label="Checkout hold">{formatDuration(facility.checkoutHoldMinutes)}</DetailRow>
            <DetailRow label="Waiver">Version {facility.waiverVersion}</DetailRow>
          </dl>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle>People</SectionTitle>
          <ul className="divide-y divide-line">
            {settings.staff.map((s) => (
              <li key={s.userId} className="flex items-center gap-3 py-3">
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper text-[14px] font-bold text-ink">
                  {s.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {s.name}
                    {s.userId === session.userId ? <span className="font-normal text-muted"> (you)</span> : null}
                  </p>
                  <p className="truncate text-[13.5px] text-muted">{s.email}</p>
                </div>
                <StatusTag tone={s.role === "owner" ? "brand" : "neutral"}>{s.role === "owner" ? "Owner" : "Staff"}</StatusTag>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <div className="mt-4 border-t border-line pt-5">
              <h3 className="mb-3 text-[15px] font-bold text-ink">Invite someone</h3>
              <InviteForm inviteAction={inviteStaffAction} />
            </div>
          ) : null}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle>Facility</SectionTitle>
          <dl className="divide-y divide-line">
            <DetailRow label="Name">{facility.name}</DetailRow>
            {facility.address || facility.city ? (
              <DetailRow label="Address">{[facility.address, facility.city].filter(Boolean).join(", ")}</DetailRow>
            ) : null}
            {facility.contactPhone ? <DetailRow label="Phone">{formatPhone(facility.contactPhone)}</DetailRow> : null}
            {facility.contactEmail ? <DetailRow label="Email">{facility.contactEmail}</DetailRow> : null}
            <DetailRow label="Time zone">
              {facility.timeZoneLabel} <span className="text-muted">({facility.timeZone})</span>
            </DetailRow>
          </dl>
        </Card>

        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-[15px] font-semibold text-ink">{session.name}</p>
            <p className="text-[13.5px] text-muted">
              {session.email} · {session.role === "owner" ? "Owner" : "Staff"}
            </p>
          </div>
          <SignOutButton action={signOutAction} />
        </Card>
      </div>
    </div>
  );
}
