import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DateTime } from "luxon";
import type { FacilityPublic, ResourceOption } from "@tymo/shared/types";
import { PillLink, buttonClass } from "@tymo/ui";
import { publicPreview } from "@/app/_lib/public-preview";
import { durationOptions, groupAnchor } from "@/components/booking/anchors";
import { deskPhone, tooFarCopy, tooSoonCopy } from "@/components/booking/copy";
import { DateStrip } from "@/components/booking/DateStrip";
import { DayNotice } from "@/components/booking/DayNotice";
import { FacilityFooter } from "@/components/booking/FacilityFooter";
import { InlineLoadError } from "@/components/booking/LoadError";
import { SlotPicker, SlotsSkeleton } from "@/components/booking/SlotPicker";
import { BackLink, StepFrame, StepHeader, StepSection } from "@/components/booking/StepChrome";
import { TimeSelectionProvider } from "@/components/booking/TimeSelection";
import { TimeSummary } from "@/components/booking/TimeSummary";
import { addDays, dateShort, dateWeekdayLong, isIsoDate, noticeWords, todayIn, zoneLongName } from "@/components/booking/time";
import { formatDuration, formatRate } from "@tymo/shared/format";
import { continueToCheckout } from "../../../actions";
import { findResource, getDateChips, getDayAvailability, getFacility } from "../../../_lib/engine";

export const metadata: Metadata = { title: "Pick a time" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Step 2 of 5: date strip, length, start times, sticky summary with Continue. */
export default async function PickTime(props: PageProps<"/book/[slug]/r/[resourceId]">) {
  const { slug, resourceId } = await props.params;
  const search = await props.searchParams;
  const [facility, found] = await Promise.all([getFacility(slug), findResource(slug, resourceId)]);
  if (!facility || !found) notFound();

  const { option, group } = found;
  const zone = facility.timeZone;
  const chips = await getDateChips(slug, option.id, 14);
  const durations = durationOptions(option.minMinutes, option.maxMinutes);
  const durParam = Number(first(search.dur));
  const dur = durations.includes(durParam) ? durParam : durations[0]!;
  const today = todayIn(zone);
  const dateParam = first(search.date);
  const date = isIsoDate(dateParam) ? dateParam : (chips.find((c) => c.bookable)?.date ?? chips[0]?.date ?? today);
  const maxDate = addDays(today, facility.bookingWindowDays, zone);
  const hrefFor = (d: string, m: number) => `/book/${slug}/r/${option.id}?date=${d}&dur=${m}`;
  const fieldsHref = `/book/${slug}/fields#${groupAnchor(group.label)}`;
  const nextDate = chips.find((c) => c.date > date && c.bookable)?.date ?? (date < maxDate ? addDays(date, 1, zone) : null);
  const key = `${date}|${dur}`;

  return (
    <>
      <StepHeader
        facility={facility}
        step={2}
        preview={publicPreview}
        title={[[{ text: publicPreview ? "View start" : "Pick a" }, { text: publicPreview ? "times" : "time", outline: true }]]}
        back={<BackLink href={fieldsHref}>Fields</BackLink>}
      >
        <p>
          <span className="font-semibold text-white">{option.name}</span>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {formatRate(option.priceCentsPerHour)}
          <span aria-hidden> · </span>
          <Link
            href={fieldsHref}
            className="inline-flex min-h-11 items-center font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
          >
            Change field
          </Link>
        </p>
        <p>
          Times are {zoneLongName(zone, facility.timeZoneLabel)}
          {facility.city ? ` (${facility.city})` : ""}.
        </p>
        {publicPreview ? <p>These are sample start times. Checkout is disabled.</p> : null}
      </StepHeader>

      <TimeSelectionProvider resetKey={key}>
        <StepFrame
          aside={
            publicPreview ? undefined : (
              <TimeSummary
                action={continueToCheckout.bind(null, slug)}
                resourceId={option.id}
                resourceName={option.name}
                date={date}
                dateLabel={dateShort(date, zone)}
                durationMinutes={dur}
                zoneLabel={facility.timeZoneLabel}
              />
            )
          }
        >
          <StepSection title="Date" id="date">
            <DateStrip
              chips={chips.map((c) => {
                const d = DateTime.fromISO(c.date, { zone });
                return {
                  date: c.date,
                  weekday: d.toFormat("ccc"),
                  day: d.toFormat("LLL d"),
                  closed: c.closed,
                  bookable: c.bookable,
                  href: hrefFor(c.date, dur),
                };
              })}
              selected={date}
              selectedLabel={dateShort(date, zone)}
              min={today}
              max={maxDate}
              moreHref={hrefFor("{date}", dur)}
            />
          </StepSection>

          <StepSection title="How long?" id="length">
            <ul className="flex flex-wrap gap-2">
              {durations.map((m) => (
                <li key={m}>
                  <PillLink href={hrefFor(date, m)} replace scroll={false} selected={m === dur} className="min-w-[4.75rem]">
                    {formatDuration(m)}
                  </PillLink>
                </li>
              ))}
            </ul>
          </StepSection>

          <StepSection
            title="Start time"
            id="start"
            aside={
              <span className="text-[13px] text-muted">
                {dateShort(date, zone)} · {formatDuration(dur)}
              </span>
            }
          >
            <InlineLoadError key={key}>
              <Suspense key={key} fallback={<SlotsSkeleton />}>
                <Times
                  slug={slug}
                  facility={facility}
                  option={option}
                  date={date}
                  dur={dur}
                  nextDate={nextDate}
                  nextHref={nextDate ? hrefFor(nextDate, dur) : null}
                  fieldsHref={fieldsHref}
                />
              </Suspense>
            </InlineLoadError>
          </StepSection>
        </StepFrame>
      </TimeSelectionProvider>
      <FacilityFooter facility={facility} barSpace={!publicPreview} />
    </>
  );
}

async function Times({
  slug,
  facility,
  option,
  date,
  dur,
  nextDate,
  nextHref,
  fieldsHref,
}: {
  slug: string;
  facility: FacilityPublic;
  option: ResourceOption;
  date: string;
  dur: number;
  nextDate: string | null;
  nextHref: string | null;
  fieldsHref: string;
}) {
  const day = await getDayAvailability(slug, option.id, date, dur);
  const zone = facility.timeZone;
  const seeNext =
    nextDate && nextHref ? (
      <Link href={nextHref} replace scroll={false} className={buttonClass({ variant: "ink", size: "md" })}>
        See {dateShort(nextDate, zone)}
      </Link>
    ) : null;
  const otherField = (
    <Link href={fieldsHref} className={buttonClass({ variant: "ghost", size: "md" })}>
      Try another field
    </Link>
  );

  if (day.closed) {
    return (
      <DayNotice
        tone="closed"
        title={`Closed ${dateWeekdayLong(date, zone)}${day.closedReason ? ` for ${day.closedReason}` : ""}.`}
        actions={seeNext}
      />
    );
  }

  if (day.dayReason === "too_soon") {
    const phone = deskPhone(facility);
    return (
      <DayNotice
        title={publicPreview ? `Requests need ${noticeWords(facility.leadTimeMinutes)} notice.` : tooSoonCopy(facility)}
        actions={
          <>
            {seeNext}
            {phone ? (
              <a href={`tel:${facility.contactPhone}`} className={buttonClass({ variant: "ghost", size: "md" })}>
                Call {phone}
              </a>
            ) : null}
          </>
        }
      />
    );
  }

  if (day.dayReason === "too_far") return <DayNotice title={tooFarCopy(facility)} />;

  if (!day.slots.some((s) => s.available)) {
    return (
      <DayNotice
        title={`${option.name} is booked all day ${dateShort(date, zone)}.`}
        actions={
          <>
            {seeNext}
            {otherField}
          </>
        }
      />
    );
  }

  return <SlotPicker day={day} readOnly={publicPreview} />;
}
