import type { Metadata } from "next";
import { requireStaff } from "@/server/auth";
import { getSettings } from "@/server/booking/staff";
import { PageHeader } from "@/components/staff/Page";
import { BlockForm } from "@/components/staff/blocks/BlockForm";
import { param, todayIn, validDate } from "../../_lib/facility";
import { createBlockAction, previewBlockAction } from "../actions";

export const metadata: Metadata = { title: "Add block" };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Add block. Calendar links prefill ?field=&date=&start=&end= ("Add block here"). */
export default async function NewBlockPage(props: PageProps<"/staff/blocks/new">) {
  const session = await requireStaff();
  const sp = await props.searchParams;
  const settings = await getSettings(session);
  const today = todayIn(settings.facility.timeZone);

  const field = param(sp.field);
  const start = param(sp.start);
  const end = param(sp.end);
  const kindParam = param(sp.kind);
  const kind = kindParam === "weekly" || kindParam === "closure" ? kindParam : "one_time";
  const date = validDate(sp.date) ?? today;
  const resourceId = field && settings.resources.some((r) => r.id === field) ? field : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ href: `/staff/calendar?date=${date}`, label: "Calendar" }}
        title={[{ text: "Add" }, { text: "block", outline: true }]}
        sub="Customers can't book blocked time. Blocks never cancel a booking."
      />
      <BlockForm
        resources={settings.resources.map((r) => ({ id: r.id, code: r.code, name: r.name, groupLabel: r.groupLabel }))}
        initial={{
          kind,
          resourceId,
          date,
          start: start && HHMM.test(start) ? start : "",
          end: end && HHMM.test(end) ? end : "",
        }}
        previewAction={previewBlockAction}
        createAction={createBlockAction}
      />
    </div>
  );
}
