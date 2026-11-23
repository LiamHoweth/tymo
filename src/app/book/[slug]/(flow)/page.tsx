import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink, Display, Marquee, Notice, Spark } from "@/components/ui";
import { groupAnchor } from "@/components/booking/anchors";
import { callTheDesk, capitalize, deskPhone } from "@/components/booking/copy";
import { FacilityFooter } from "@/components/booking/FacilityFooter";
import { FacilityMark } from "@/components/booking/FacilityMark";
import { ArrowRight, Phone } from "@/components/booking/icons";
import { formatRate } from "@/lib/format";
import { getFacility, getFieldGroups } from "../_lib/engine";

const STEPS = [
  "Pick a field and a time.",
  "Add your details and a card. Nothing is charged yet.",
  "The front desk confirms, then your card is charged.",
];

/** Booking page landing: whose page this is, what can be booked, and what it costs. */
export default async function FacilityLanding(props: PageProps<"/book/[slug]">) {
  const { slug } = await props.params;
  const [facility, groups] = await Promise.all([getFacility(slug), getFieldGroups(slug)]);
  if (!facility) notFound();
  const phone = deskPhone(facility);
  const fieldsHref = `/book/${slug}/fields`;

  return (
    <>
      <main className="flex flex-1 flex-col">
        <section className="court-grid text-white">
          <div className="mx-auto max-w-6xl px-4 pb-14 pt-3 sm:px-6 lg:pb-24">
            <div className="flex min-h-14 items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <FacilityMark facility={facility} />
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold leading-tight">{facility.name}</p>
                  {facility.city ? <p className="text-[13px] text-white/70">{facility.city}</p> : null}
                </div>
              </div>
              {phone ? (
                <a
                  href={`tel:${facility.contactPhone}`}
                  className="hidden min-h-11 items-center gap-2 rounded-full border-[1.5px] border-white/30 px-4 text-[14px] font-semibold hover:border-white sm:inline-flex"
                >
                  <Phone className="h-4 w-4" />
                  {phone}
                </a>
              ) : null}
            </div>

            <div className="rise-in mt-14 max-w-4xl sm:mt-20 lg:mt-28">
              <Spark className="mb-6 h-7 w-7" />
              <Display size="2xl" lines={["Book a", [{ text: "field", outline: true }]]} />
              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/85 sm:text-lg">
                Pick a field and a time. The front desk confirms, then your card is charged.
              </p>
              <ButtonLink href={fieldsHref} size="lg" className="mt-8">
                Book a field
                <ArrowRight className="h-5 w-5" />
              </ButtonLink>
            </div>
          </div>
        </section>

        {groups.length ? (
          <Marquee
            tone="brand"
            words={[...groups.map((g) => g.label), "Prices up front", "No account needed"]}
            label={`Book ${groups.map((g) => g.label.toLowerCase()).join(", ")} online.`}
          />
        ) : null}

        <section
          aria-labelledby="fields-title"
          className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12 lg:py-20"
        >
          <div className="contours rounded-[24px] p-6 text-white sm:p-8 lg:sticky lg:top-8">
            <Spark className="h-6 w-6" />
            <h2 id="fields-title" className="display mt-5 text-[clamp(1.9rem,6vw,2.75rem)]">
              Fields <span className="text-outline">and prices</span>
            </h2>
            <ol className="mt-6 space-y-4">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-4">
                  <span className="display w-7 shrink-0 text-[1.35rem] leading-none text-white/50">{i + 1}</span>
                  <span className="text-[15px] leading-snug text-white/85">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 lg:mt-0">
            {groups.length ? (
              <ul className="overflow-hidden rounded-[24px] border border-line">
                {groups.map((group, i) => (
                  <li key={group.label} className={i % 2 ? "bg-paper" : "bg-white"}>
                    <Link
                      href={`${fieldsHref}#${groupAnchor(group.label)}`}
                      className="group flex min-h-24 items-center gap-4 px-5 py-5 transition-colors hover:bg-[color-mix(in_oklab,var(--brand)_6%,white)] sm:px-7"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="display text-[clamp(1.25rem,4.4vw,1.75rem)] text-ink">{group.label}</p>
                        <p className="mt-1.5 text-[14px] leading-snug text-muted">{group.detail}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">From</p>
                        <p className="text-[18px] font-bold tabular-nums text-text">{formatRate(group.fromPriceCentsPerHour)}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Notice title="No fields are listed yet.">{capitalize(callTheDesk(facility))} to book.</Notice>
            )}
          </div>
        </section>
      </main>
      <FacilityFooter facility={facility} />
    </>
  );
}
