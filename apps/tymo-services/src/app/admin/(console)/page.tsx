import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@tymo/platform/auth/admin-session";
import {
  getAdminOverview,
  listAdminFacilityOptions,
  listAdminRequests,
  parseAdminStatus,
} from "@tymo/company/admin";
import { buttonClass } from "@/components/admin/controls";
import { FacilityFilter } from "@/components/admin/FacilityFilter";
import { EmptyState, Note, PageFrame, PageHeader } from "@/components/admin/Panel";
import { RequestsTable } from "@/components/admin/RequestsTable";
import { StatusTabs } from "@/components/admin/StatusTabs";
import { SummaryStrip } from "@/components/admin/SummaryStrip";
import { EMPTY_COPY, requestsHref } from "@/components/admin/status";

export const metadata: Metadata = { title: "Requests", robots: { index: false } };

export default async function AdminRequestsPage(props: PageProps<"/admin">) {
  await requireAdmin();
  const query = await props.searchParams;
  const status = parseAdminStatus(query.status);
  const rawFacility = typeof query.facility === "string" && query.facility ? query.facility : null;

  const [overview, facilityOptions] = await Promise.all([getAdminOverview(), listAdminFacilityOptions()]);
  // Only filter by a facility that exists, so the menu always shows what the list is filtered by.
  const facility = rawFacility ? (facilityOptions.find((f) => f.slug === rawFacility) ?? null) : null;
  const { rows, truncated } = await listAdminRequests({ status, facilitySlug: facility?.slug ?? null });

  const empty = EMPTY_COPY[status];

  return (
    <PageFrame>
      <PageHeader title="Requests" description="Every facility. Times are in each facility's time zone." />

      <SummaryStrip overview={overview} />

      <div className="mt-8">
        <StatusTabs active={status} facilitySlug={facility?.slug ?? null} />
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <FacilityFilter options={facilityOptions} selected={facility?.slug ?? null} status={status} />
        {rows.length > 0 && !truncated ? (
          <p className="text-[13px] tabular-nums text-muted md:pb-3">
            {rows.length} {rows.length === 1 ? "booking" : "bookings"}
            {facility ? ` at ${facility.name}` : ""}
          </p>
        ) : null}
      </div>

      {rawFacility && !facility ? (
        <Note className="mt-4">No facility matches that link, so this shows every facility.</Note>
      ) : null}

      {truncated ? (
        <Note className="mt-4">
          {facility ? "Showing the first 200." : "Showing the first 200. Narrow it by facility."}
        </Note>
      ) : null}

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title={facility ? `${empty.title} at ${facility.name}` : empty.title}
            action={
              facility ? (
                <Link href={requestsHref(status, null)} className={buttonClass("secondary")}>
                  Show every facility
                </Link>
              ) : undefined
            }
          >
            {empty.body}
          </EmptyState>
        ) : (
          <RequestsTable rows={rows} status={status} />
        )}
      </div>
    </PageFrame>
  );
}
