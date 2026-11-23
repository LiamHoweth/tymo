import type { FacilityPublic } from "@/lib/types";
import { Display, Kicker, Spark, buttonClass } from "@/components/ui";
import { bookingsOffCopy, deskPhone } from "./copy";
import { FacilityFooter } from "./FacilityFooter";
import { FacilityMark } from "./FacilityMark";
import { Phone } from "./icons";

/** Shown instead of the booking flow while a facility has online booking switched off. */
export function BookingsClosed({ facility }: { facility: FacilityPublic }) {
  const phone = deskPhone(facility);
  return (
    <>
      <main className="court-grid flex flex-1 flex-col text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-16 pt-4 sm:px-6">
          <div className="flex min-h-11 items-center gap-3">
            <FacilityMark facility={facility} size="sm" />
            <span className="text-[15px] font-semibold">{facility.name}</span>
          </div>
          <div className="rise-in my-auto max-w-2xl py-16">
            <Spark className="mb-5 h-7 w-7" />
            <Kicker className="mb-4 text-white/75">{facility.city ? `${facility.name} · ${facility.city}` : facility.name}</Kicker>
            <Display size="xl" lines={[[{ text: "Call to" }, { text: "book", outline: true }]]} />
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/85">{bookingsOffCopy(facility)}</p>
            {phone ? (
              <a href={`tel:${facility.contactPhone}`} className={buttonClass({ variant: "accent", size: "lg" }, "mt-8")}>
                <Phone className="h-5 w-5" />
                Call {phone}
              </a>
            ) : null}
          </div>
        </div>
      </main>
      <FacilityFooter facility={facility} />
    </>
  );
}
