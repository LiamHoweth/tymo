import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@tymo/ui";
import { publicPreview } from "@/app/_lib/public-preview";
import { groupAnchor } from "@/components/booking/anchors";
import { callTheDesk, capitalize } from "@/components/booking/copy";
import { FacilityFooter } from "@/components/booking/FacilityFooter";
import { FieldCardView } from "@/components/booking/FieldCardView";
import { BackLink, StepFrame, StepHeader } from "@/components/booking/StepChrome";
import { getFacility, getFieldGroups } from "../../_lib/engine";

export const metadata: Metadata = { title: "Choose a field" };

/** Step 1 of 5: each field is one card; halves are choices inside it. */
export default async function ChooseField(props: PageProps<"/book/[slug]/fields">) {
  const { slug } = await props.params;
  const [facility, groups] = await Promise.all([getFacility(slug), getFieldGroups(slug)]);
  if (!facility) notFound();

  return (
    <>
      <StepHeader
        facility={facility}
        step={1}
        preview={publicPreview}
        title={[[{ text: "Choose a" }, { text: "field", outline: true }]]}
        back={<BackLink href={`/book/${slug}`}>{facility.name}</BackLink>}
      >
        {publicPreview ? "Sample rates are per hour. Choose a field to browse availability." : "Prices are per hour. You pick the time next."}
      </StepHeader>

      <StepFrame>
        {groups.length ? (
          <div className="space-y-12">
            {groups.map((group) => (
              <section key={group.label} id={groupAnchor(group.label)} aria-labelledby={`${groupAnchor(group.label)}-title`} className="scroll-mt-6">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 id={`${groupAnchor(group.label)}-title`} className="display text-[clamp(1.5rem,5vw,2.1rem)] text-ink">
                    {group.label}
                  </h2>
                  <p className="text-[14px] text-muted">{group.detail}</p>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.cards.map((card) => (
                    <FieldCardView key={card.id} card={card} slug={slug} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Notice title="No fields are open for online booking right now.">
            {publicPreview ? null : `${capitalize(callTheDesk(facility))} to book.`}
          </Notice>
        )}
      </StepFrame>
      <FacilityFooter facility={facility} />
    </>
  );
}
