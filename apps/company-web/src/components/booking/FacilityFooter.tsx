import Link from "next/link";
import type { FacilityPublic } from "@tymo/shared/types";
import { TymoMark } from "@tymo/ui";
import { cn } from "@tymo/shared/cn";
import { deskPhone } from "./copy";

/** Tymo's website; public so the footer works in client components too. */
const TYMO_WEB_URL = process.env.NEXT_PUBLIC_TYMO_WEB_URL || "https://booktymo.com";

/** Footer on every facility page: address, front-desk phone, "Bookings by Tymo". */
export function FacilityFooter({
  facility,
  barSpace,
  className,
}: {
  facility: FacilityPublic;
  /** Leave room under the content for the fixed summary bar on phones. */
  barSpace?: boolean;
  className?: string;
}) {
  const phone = deskPhone(facility);
  return (
    <footer className={cn("bg-ink text-white", barSpace && "pb-40 lg:pb-0", className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-[17px] font-semibold">{facility.name}</p>
          {facility.address ? <p className="text-[15px] text-white/70">{facility.address}</p> : null}
          {phone ? (
            <p className="text-[15px] text-white/70">
              Questions? Call the front desk at{" "}
              <a
                href={`tel:${facility.contactPhone}`}
                className="whitespace-nowrap font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
              >
                {phone}
              </a>
            </p>
          ) : facility.contactEmail ? (
            <p className="text-[15px] text-white/70">
              Questions? Email{" "}
              <a href={`mailto:${facility.contactEmail}`} className="font-semibold text-white underline underline-offset-4">
                {facility.contactEmail}
              </a>
            </p>
          ) : null}
        </div>
        <Link
          href={TYMO_WEB_URL}
          className="inline-flex min-h-11 items-center gap-2 self-start text-[13px] text-white/60 hover:text-white md:self-auto"
        >
          <TymoMark className="h-4 w-4" />
          Bookings by Tymo
        </Link>
      </div>
    </footer>
  );
}
