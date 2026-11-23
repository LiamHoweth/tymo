import { notFound } from "next/navigation";
import { BookingsClosed } from "@/components/booking/BookingsClosed";
import { getFacility } from "../_lib/engine";

/**
 * The booking flow (landing, fields, times, checkout). While a facility has
 * online booking off, every step shows the calm "call the front desk" page.
 * The private booking page (b/[publicToken]) sits outside this group so
 * existing bookings keep working.
 */
export default async function FlowLayout(props: LayoutProps<"/book/[slug]">) {
  const { slug } = await props.params;
  const facility = await getFacility(slug);
  if (!facility) notFound();
  if (!facility.bookingsEnabled) return <BookingsClosed facility={facility} />;
  return props.children;
}
