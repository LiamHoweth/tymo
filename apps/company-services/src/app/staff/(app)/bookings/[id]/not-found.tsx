import { ButtonLink } from "@tymo/ui";
import { Card } from "@/components/staff/Page";

export default function BookingNotFound() {
  return (
    <div className="mx-auto max-w-xl">
      <Card className="px-5 py-10 text-center sm:px-8">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">Booking not found.</h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-snug text-muted">
          The link may be wrong, or the booking belongs to another facility.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <ButtonLink href="/staff" variant="ink">
            Go to Approvals
          </ButtonLink>
          <ButtonLink href="/staff/calendar" variant="ghost">
            Open the calendar
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
