import Link from "next/link";
import { buttonClass } from "@/components/admin/controls";
import { EmptyState, PageFrame } from "@/components/admin/Panel";

export default function AdminBookingNotFound() {
  return (
    <PageFrame>
      <EmptyState
        titleAs="h1"
        title="Booking not found"
        action={
          <Link href="/admin?status=all" className={buttonClass("secondary")}>
            All requests
          </Link>
        }
      >
        No booking has that ID. Check the link, or find the booking under All in Requests.
      </EmptyState>
    </PageFrame>
  );
}
