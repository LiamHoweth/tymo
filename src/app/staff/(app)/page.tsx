import type { Metadata } from "next";
import { requireStaff } from "@/server/auth";
import { getApprovalQueue, getSetupChecklist } from "@/server/booking/staff";
import { ApprovalQueue } from "@/components/staff/approvals/ApprovalQueue";
import { SetupChecklist } from "@/components/staff/approvals/SetupChecklist";
import { Notice, PageHeader } from "@/components/staff/Page";
import { confirmFieldsAction, declineRequestAction, setBookingsEnabledAction } from "./actions";
import { param } from "./_lib/facility";

// Same segment as the (app) layout, so its title template does not apply here.
export const metadata: Metadata = { title: { absolute: "Approvals · Staff · Tymo" } };

export default async function ApprovalsPage(props: PageProps<"/staff">) {
  const session = await requireStaff();
  const searchParams = await props.searchParams;
  const [queue, checklist] = await Promise.all([getApprovalQueue(session), getSetupChecklist(session)]);
  const isOwner = session.role === "owner";
  const ownerOnly = param(searchParams.notice) === "owner-only";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={[{ text: "Approvals" }]} />

      {ownerOnly ? (
        <Notice title="Only the owner can do that." className="mb-5">
          Ask the owner if a price, payout or refund needs to change.
        </Notice>
      ) : null}

      {isOwner ? (
        <SetupChecklist checklist={checklist} confirmAction={confirmFieldsAction} enableAction={setBookingsEnabledAction} />
      ) : !checklist.bookingsEnabled ? (
        <Notice tone="warn" title="Bookings are off." className="mb-6">
          The owner is finishing setup. Requests show up here once bookings are on.
        </Notice>
      ) : null}

      <ApprovalQueue items={queue} declineAction={declineRequestAction} />
    </div>
  );
}
