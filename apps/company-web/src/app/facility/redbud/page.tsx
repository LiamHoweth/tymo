import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BrandScope, ButtonLink, Notice, TymoMark } from "@tymo/ui";
import { env } from "@tymo/shared/env";
import { formatRate } from "@tymo/shared/format";
import type { FieldGroup } from "@tymo/shared/types";
import { publicPreview } from "@/app/_lib/public-preview";
import { getFacility, getFieldGroups } from "@/app/book/[slug]/_lib/engine";
import { groupAnchor } from "@/components/booking/anchors";
import { FacilityMark } from "@/components/booking/FacilityMark";
import { FieldDiagram } from "@/components/booking/FieldDiagram";
import { FacilityPhoto } from "@/components/facility/FacilityPhoto";

export const metadata: Metadata = {
  title: { absolute: "Redbud Soccer Complex" },
  description: "Explore field rentals and sample availability at the fictional Redbud Soccer Complex.",
  robots: { index: false, follow: false },
};

const bookingHref = "/book/redbud";

export default async function RedbudFacilityPage() {
  await connection();
  const [facility, groups] = await Promise.all([getFacility("redbud"), getFieldGroups("redbud")]);
  if (!facility) notFound();

  const canBrowse = facility.bookingsEnabled && groups.length > 0;
  const bookingLabel = publicPreview ? "Browse availability" : "Book a field";

  return (
    <BrandScope brand={facility.brand}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-full focus:bg-white focus:px-5 focus:py-3"
      >
        Skip to content
      </a>
      <header className="border-b border-white/15 bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3 sm:px-8">
          <Link href="/facility/redbud" className="flex min-h-11 min-w-0 items-center gap-3 font-semibold">
            <FacilityMark facility={facility} />
            <span>{facility.name}</span>
          </Link>
          <nav aria-label="Facility" className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:gap-x-8">
            <a href="#fields" className="inline-flex min-h-11 items-center text-sm font-semibold text-white/85 hover:text-white">
              Fields and rates
            </a>
            {canBrowse ? (
              <div className="hidden sm:block">
                <ButtonLink href={bookingHref} variant="ghostDark">{bookingLabel}</ButtonLink>
              </div>
            ) : null}
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <section aria-labelledby="facility-title" className="court-grid text-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-7 pt-12 sm:px-8 sm:pb-10 sm:pt-16 lg:grid-cols-[minmax(0,0.87fr)_minmax(0,1fr)] lg:gap-10 lg:py-14">
            <div className="flex min-w-0 flex-col items-start justify-center pb-3 lg:py-8">
              <p className="text-sm font-semibold text-white/75">Fictional facility demo</p>
              <h1 id="facility-title" className="display mt-5 text-[clamp(2.55rem,10vw,4.5rem)] lg:text-[clamp(3rem,5vw,4.75rem)]">
                Redbud<br />Soccer<br /><span className="text-outline">Complex</span>
              </h1>
              <p className="mt-6 max-w-[34ch] text-base leading-relaxed text-white/85 sm:text-lg">
                Explore indoor turf, outdoor turf and natural grass fields for practices, scrimmages and games.
              </p>
              {canBrowse ? (
                <ButtonLink href={bookingHref} size="lg" className="mt-7">{bookingLabel}</ButtonLink>
              ) : null}
            </div>
            <FacilityPhoto />
          </div>
        </section>

        <section id="fields" aria-labelledby="fields-title" className="mx-auto w-full max-w-7xl scroll-mt-6 px-4 py-12 sm:px-8 sm:py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="fields-title" className="display text-[clamp(1.95rem,6vw,3.65rem)] text-ink">Fields and rates</h2>
            {canBrowse ? (
              <p className="max-w-[30ch] text-base leading-relaxed text-muted">Choose a field type to see individual pitches and times.</p>
            ) : null}
          </div>
          {groups.length ? (
            <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <FieldCategory key={group.label} group={group} canBrowse={canBrowse} />
              ))}
            </ul>
          ) : (
            <Notice title="No fields are listed right now." className="mt-6" />
          )}
        </section>

        {canBrowse ? (
          <section aria-labelledby="rental-title" className="border-t border-line bg-white">
            <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-16">
              <div className="flex flex-col items-start justify-center">
                <h2 id="rental-title" className="display text-[clamp(1.95rem,6vw,3.5rem)] text-ink">
                  {publicPreview ? "Try the booking preview" : "How rentals work"}
                </h2>
                {publicPreview ? (
                  <p className="mt-4 max-w-[40ch] text-base leading-relaxed text-muted">
                    Redbud is a fictional facility. This preview uses sample rates and availability, and checkout is disabled.
                  </p>
                ) : null}
                <ButtonLink href={bookingHref} variant="ink" className="mt-6">{bookingLabel}</ButtonLink>
              </div>
              <ol className="grid content-center gap-4 border-l-2 border-accent pl-5 text-base leading-relaxed text-text sm:pl-7">
                <li><strong>1. Choose a field.</strong> Compare full fields, split fields and indoor space.</li>
                <li><strong>2. Choose a date and rental length.</strong> Times appear in {facility.timeZoneLabel}.</li>
                <li>
                  {publicPreview ? (
                    <><strong>3. Review available start times.</strong> No reservation or payment is needed.</>
                  ) : (
                    <><strong>3. Request the time.</strong> You’re charged only after the facility approves.</>
                  )}
                </li>
              </ol>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-5 sm:px-8">
          <p className="text-sm font-semibold">{facility.name}</p>
          <Link href={env.tymoWebUrl} className="inline-flex min-h-11 items-center gap-2 text-sm text-white/75 hover:text-white">
            <TymoMark className="h-4 w-4" /> Bookings by Tymo
          </Link>
        </div>
      </footer>
    </BrandScope>
  );
}

function FieldCategory({ group, canBrowse }: { group: FieldGroup; canBrowse: boolean }) {
  const fieldCount = group.cards.length;

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-line bg-white">
      <div className="flex items-center justify-between gap-4 bg-[color-mix(in_oklab,var(--brand)_8%,white)] px-5 py-4 sm:px-6">
        <FieldDiagram layout={group.cards[0]?.layout ?? "single"} className="w-24 sm:w-28" />
        <p className="text-sm font-semibold text-brand">{fieldCount} {fieldCount === 1 ? "pitch" : "pitches"}</p>
      </div>
      <div className="flex flex-1 flex-col items-start p-5 sm:p-6">
        <h3 className="display text-[clamp(1.35rem,5vw,1.75rem)] leading-tight text-ink">{group.label}</h3>
        <p className="mt-2 flex-1 text-base leading-relaxed text-muted">{group.detail}</p>
        <div className="mt-5 flex w-full flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-base font-semibold tabular-nums text-text">From {formatRate(group.fromPriceCentsPerHour)}</p>
          {canBrowse ? (
            <Link
              href={`${bookingHref}/fields#${groupAnchor(group.label)}`}
              aria-label={`View fields in ${group.label}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline decoration-brand/35 underline-offset-4 hover:decoration-brand"
            >
              View fields
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
