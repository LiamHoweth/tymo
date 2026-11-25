import type { Metadata } from "next";
import { requireAdmin } from "@tymo/platform/auth/admin-session";
import { listAdminFacilities } from "@tymo/company/admin";
import { FacilitiesTable } from "@/components/admin/FacilitiesTable";
import { EmptyState, PageFrame, PageHeader } from "@/components/admin/Panel";

export const metadata: Metadata = { title: "Facilities", robots: { index: false } };

export default async function AdminFacilitiesPage() {
  await requireAdmin();
  const facilities = await listAdminFacilities();

  return (
    <PageFrame>
      <PageHeader
        title="Facilities"
        description={
          facilities.length === 1 ? "1 facility on Tymo." : `${facilities.length} facilities on Tymo.`
        }
      />
      {facilities.length === 0 ? (
        <EmptyState title="No facilities yet">Each facility shows up here once it&apos;s set up on Tymo.</EmptyState>
      ) : (
        <FacilitiesTable rows={facilities} />
      )}
    </PageFrame>
  );
}
