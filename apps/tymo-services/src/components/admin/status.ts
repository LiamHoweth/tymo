import type { AdminStatusFilter } from "@tymo/company/admin";

export const STATUS_TABS: { value: AdminStatusFilter; label: string }[] = [
  { value: "requested", label: "Requested" },
  { value: "booked", label: "Booked" },
  { value: "not_booked", label: "Not booked" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

/** Empty state per status filter: what's missing, then what lands here. */
export const EMPTY_COPY: Record<AdminStatusFilter, { title: string; body: string }> = {
  requested: {
    title: "No requests waiting",
    body: "New requests land here as soon as a renter's card is held.",
  },
  booked: {
    title: "No booked times",
    body: "Requests land here once staff approve them and the card is charged.",
  },
  not_booked: {
    title: "No declined or failed requests",
    body: "Requests land here when staff decline them or the card fails at approval.",
  },
  expired: {
    title: "No expired requests",
    body: "Requests land here when the approval deadline passes without a decision.",
  },
  cancelled: {
    title: "No cancellations",
    body: "Bookings land here when a renter or the facility cancels them.",
  },
  all: {
    title: "No bookings yet",
    body: "Requests show up here once a renter's card is held on any facility's booking page.",
  },
};

/** /admin with the given filters; "requested" is the default, so it stays out of the URL. */
export function requestsHref(status: AdminStatusFilter, facilitySlug: string | null): string {
  const params = new URLSearchParams();
  if (status !== "requested") params.set("status", status);
  if (facilitySlug) params.set("facility", facilitySlug);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}
