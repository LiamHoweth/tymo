import type { Metadata } from "next";
import { requireStaff } from "@/server/auth";
import { listBlocks } from "@/server/booking/staff";
import { ButtonLink } from "@/components/ui";
import { PageHeader } from "@/components/staff/Page";
import { PlusIcon } from "@/components/staff/icons";
import { BlockList } from "@/components/staff/blocks/BlockList";
import { removeBlockAction } from "./actions";

export const metadata: Metadata = { title: "Blocks" };

export default async function BlocksPage() {
  const session = await requireStaff();
  const blocks = await listBlocks(session);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/staff/calendar", label: "Calendar" }}
        title={[{ text: "Blocks" }]}
        sub="Time customers can't book: recurring renters, phone bookings and closures."
        actions={
          <ButtonLink href="/staff/blocks/new" variant="ink" size="sm" className="min-h-11">
            <PlusIcon className="h-4 w-4" />
            Add block
          </ButtonLink>
        }
      />
      {blocks.length === 0 ? (
        <div className="rounded-card border border-dashed border-[#c9d1dd] bg-white/60 px-6 py-12 text-center">
          <p className="text-[16px] font-semibold text-ink">No blocks yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-[14.5px] leading-snug text-muted">
            Add one for a weekly school practice, a booking paid in cash, or a holiday closure.
          </p>
        </div>
      ) : (
        <BlockList blocks={blocks} removeAction={removeBlockAction} />
      )}
    </div>
  );
}
