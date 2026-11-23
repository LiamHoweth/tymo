import Link from "next/link";
import type { ReactNode } from "react";
import type { FacilityPublic } from "@/lib/types";
import { ButtonLink, Display, Spark, type DisplayLine } from "@/components/ui";
import { ALREADY_SENT_COPY } from "./copy";
import { FacilityFooter } from "./FacilityFooter";
import { FacilityMark } from "./FacilityMark";

/** A full-screen state inside checkout (already sent, checkout gone). */
export function CheckoutStatePage({
  facility,
  title,
  children,
  actions,
}: {
  facility: FacilityPublic;
  title: DisplayLine[];
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <>
      <main className="court-grid flex flex-1 flex-col text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-3 sm:px-6">
          <Link href={`/book/${facility.slug}`} className="flex min-h-11 items-center gap-2.5 self-start">
            <FacilityMark facility={facility} size="sm" />
            <span className="text-[14px] font-semibold">{facility.name}</span>
          </Link>
          <div className="rise-in my-auto max-w-2xl py-16">
            <Spark className="mb-5 h-7 w-7" />
            <Display as="h1" size="lg" lines={title} />
            <div className="mt-5 max-w-md text-[17px] leading-relaxed text-white/85">{children}</div>
            <div className="mt-8 flex flex-wrap gap-3">{actions}</div>
          </div>
        </div>
      </main>
      <FacilityFooter facility={facility} />
    </>
  );
}

export function AlreadySent({ facility, bookingHref }: { facility: FacilityPublic; bookingHref?: string }) {
  return (
    <CheckoutStatePage
      facility={facility}
      title={[[{ text: "Already" }, { text: "sent", outline: true }]]}
      actions={
        <>
          {bookingHref ? (
            <ButtonLink href={bookingHref} size="lg">
              View your request
            </ButtonLink>
          ) : null}
          <ButtonLink href={`/book/${facility.slug}/fields`} size="lg" variant="ghostDark">
            Book another time
          </ButtonLink>
        </>
      }
    >
      <p role="status">
        {ALREADY_SENT_COPY}
        {bookingHref ? null : " Your confirmation email has the link to view or cancel it."}
      </p>
    </CheckoutStatePage>
  );
}

export function CheckoutGone({ facility }: { facility: FacilityPublic }) {
  return (
    <CheckoutStatePage
      facility={facility}
      title={[[{ text: "Pick a time" }], [{ text: "again", outline: true }]]}
      actions={
        <ButtonLink href={`/book/${facility.slug}/fields`} size="lg">
          Pick a time
        </ButtonLink>
      }
    >
      <p>
        This checkout isn&apos;t open on this device. The hold may have run out, or the link was opened somewhere else.
        You haven&apos;t been charged.
      </p>
    </CheckoutStatePage>
  );
}
