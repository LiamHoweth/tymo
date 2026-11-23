import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { requireStaff } from "@tymo/platform/auth";
import { getCalendarDay, getCalendarWeek } from "@tymo/company/staff";
import { ButtonLink } from "@tymo/ui";
import { PageHeader } from "@/components/staff/Page";
import { ChevronLeft, ListIcon, PlusIcon } from "@/components/staff/icons";
import { DateNavigator, ViewToggle } from "@/components/staff/calendar/DateNavigator";
import { DayGrid, Legend } from "@/components/staff/calendar/DayGrid";
import { FieldDayList } from "@/components/staff/calendar/FieldDayList";
import { WeekView } from "@/components/staff/calendar/WeekView";
import { buildDay } from "@/components/staff/calendar/model";
import { facilityTimeZone, param, todayIn, validDate } from "../_lib/facility";
import { removeBlockAction } from "../blocks/actions";

export const metadata: Metadata = { title: "Calendar" };

function calendarHref(q: { date?: string; view?: "day" | "week"; field?: string | null }) {
  const p = new URLSearchParams();
  if (q.date) p.set("date", q.date);
  if (q.view === "week") p.set("view", "week");
  if (q.field) p.set("field", q.field);
  const s = p.toString().replace("%7Bdate%7D", "{date}");
  return s ? `/staff/calendar?${s}` : "/staff/calendar";
}

function BlockButtons({ addHref }: { addHref: string }) {
  return (
    <>
      <ButtonLink href="/staff/blocks" variant="ghost" size="sm" className="min-h-11">
        <ListIcon className="h-4 w-4" />
        Blocks
      </ButtonLink>
      <ButtonLink href={addHref} variant="ink" size="sm" className="min-h-11">
        <PlusIcon className="h-4 w-4" />
        Add block
      </ButtonLink>
    </>
  );
}

/** Day view (all fields, or one field as a list) and week view. State lives in ?date=&view=&field=. */
export default async function CalendarPage(props: PageProps<"/staff/calendar">) {
  const session = await requireStaff();
  const sp = await props.searchParams;
  const zone = await facilityTimeZone(session);
  const today = todayIn(zone);
  const date = validDate(sp.date) ?? today;
  const view = param(sp.view) === "week" ? "week" : "day";
  const field = param(sp.field) ?? null;
  const at = DateTime.fromISO(date, { zone });

  if (view === "week") {
    const start = at.startOf("week");
    const end = start.plus({ days: 6 });
    const weekStart = start.toISODate()!;
    const days = (await getCalendarWeek(session, weekStart)).map((d) => buildDay(d, zone));
    const label = start.hasSame(end, "month")
      ? `${start.toFormat("LLL d")} to ${end.toFormat("d")}`
      : `${start.toFormat("LLL d")} to ${end.toFormat("LLL d")}`;
    const tz = days[0]?.timeZoneLabel;
    const addHref = `/staff/blocks/new?date=${date}`;

    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title={[{ text: "Calendar" }]}
          className="mb-4 lg:mb-6"
          actions={<ViewToggle view="week" dayHref={calendarHref({ date })} weekHref={calendarHref({ date, view: "week", field })} />}
        />
        <DateNavigator
          label={label}
          date={date}
          view="week"
          prevHref={calendarHref({ date: start.minus({ weeks: 1 }).toISODate()!, view: "week", field })}
          nextHref={calendarHref({ date: start.plus({ weeks: 1 }).toISODate()!, view: "week", field })}
          todayHref={calendarHref({ date: today, view: "week", field })}
          isCurrent={today >= weekStart && today <= end.toISODate()!}
          pickHref={calendarHref({ date: "{date}", view: "week", field })}
          aside={<BlockButtons addHref={addHref} />}
        />
        <div className="mt-4">
          <WeekView days={days} fieldId={field} weekHref={calendarHref({ date, view: "week" })} removeAction={removeBlockAction} />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Legend />
          {tz ? <p className="text-[12.5px] text-muted">Times in {tz}. Tap a day to see it as a list.</p> : null}
        </div>
        <div className="mt-5 flex gap-2 sm:hidden">
          <BlockButtons addHref={addHref} />
        </div>
      </div>
    );
  }

  const day = buildDay(await getCalendarDay(session, date), zone);
  const row = field ? day.rows.find((r) => r.resourceId === field) : undefined;
  const keep = row ? field : null;
  const addHref = `/staff/blocks/new?${new URLSearchParams(row ? { date, field: row.resourceId } : { date }).toString()}`;

  const header = (
    <PageHeader
      title={[{ text: "Calendar" }]}
      className="mb-4 lg:mb-6"
      actions={<ViewToggle view="day" dayHref={calendarHref({ date, field: keep })} weekHref={calendarHref({ date, view: "week", field: keep })} />}
    />
  );
  const nav = (
    <DateNavigator
      label={at.toFormat("ccc, LLL d")}
      date={date}
      view="day"
      prevHref={calendarHref({ date: at.minus({ days: 1 }).toISODate()!, field: keep })}
      nextHref={calendarHref({ date: at.plus({ days: 1 }).toISODate()!, field: keep })}
      todayHref={calendarHref({ date: today, field: keep })}
      isCurrent={date === today}
      pickHref={calendarHref({ date: "{date}", field: keep })}
      aside={<BlockButtons addHref={addHref} />}
    />
  );

  if (row) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        {nav}
        <Link
          href={calendarHref({ date })}
          className="-ml-2 mt-3 inline-flex min-h-11 items-center gap-1 rounded-full pl-1 pr-3 text-[14px] font-semibold text-muted hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
          All fields
        </Link>
        <div className="mt-1">
          <FieldDayList day={day} row={row} removeAction={removeBlockAction} />
        </div>
        <div className="mt-5 flex gap-2 sm:hidden">
          <BlockButtons addHref={addHref} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {header}
      {nav}
      <div className="mt-4">
        <DayGrid day={day} removeAction={removeBlockAction} />
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Legend />
        <p className="text-[12.5px] text-muted">
          Times in {day.timeZoneLabel}.<span className="lg:hidden"> Tap a field to see its day as a list.</span>
          <span className="hidden lg:inline"> Tap open time to add a block.</span>
        </p>
      </div>
      <div className="mt-5 flex gap-2 sm:hidden">
        <BlockButtons addHref={addHref} />
      </div>
    </div>
  );
}
