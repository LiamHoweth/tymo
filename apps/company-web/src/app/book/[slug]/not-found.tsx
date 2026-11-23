"use client";

import { ButtonLink, Display, Spark } from "@tymo/ui";
import { callTheDesk } from "@/components/booking/copy";
import { useOptionalFacility } from "@/components/booking/FacilityContext";

/** Unknown booking link, field or checkout under a known facility. */
export default function FacilityNotFound() {
  const facility = useOptionalFacility();
  return (
    <main className="court-grid flex flex-1 flex-col text-white">
      <div className="rise-in mx-auto my-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <Spark className="mb-5 h-7 w-7" />
        <Display as="h1" size="lg" lines={[[{ text: "Link not" }, { text: "found", outline: true }]]} />
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/85">
          This link doesn&apos;t match a booking or field. Private booking links work until 30 days after the booking
          ends.
          {facility ? ` For help, ${callTheDesk(facility)}.` : ""}
        </p>
        {facility ? (
          <ButtonLink href={`/book/${facility.slug}`} size="lg" className="mt-8">
            Book a field
          </ButtonLink>
        ) : null}
      </div>
    </main>
  );
}
