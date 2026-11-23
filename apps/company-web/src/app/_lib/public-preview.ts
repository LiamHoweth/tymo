import "server-only";
import { notFound } from "next/navigation";

/** A public facility demo can show inventory and availability without accepting bookings. */
export const publicPreview = process.env.TYMO_PUBLIC_PREVIEW === "1";

export function requireBookingAccess() {
  if (publicPreview) notFound();
}
