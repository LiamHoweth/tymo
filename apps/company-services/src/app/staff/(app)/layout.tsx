import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { requireStaff } from "@tymo/platform/auth";
import { getApprovalQueue } from "@tymo/company/staff";
import { StaffProvider } from "@/components/staff/StaffProvider";
import { StaffShell } from "@/components/staff/StaffShell";
import { approveRequestAction, signOutAction } from "./actions";

export const metadata: Metadata = {
  title: { default: "Staff", template: "%s · Staff · Tymo" },
  robots: { index: false, follow: false },
};

/** Every signed-in staff page renders inside this shell. */
export default async function StaffAppLayout({ children }: { children: ReactNode }) {
  // Staff pages are per person and per request; never prerender them.
  await connection();
  const session = await requireStaff();

  // The badge is a convenience: if the count fails, the pages still load.
  let waitingCount: number | null = null;
  try {
    waitingCount = (await getApprovalQueue(session)).length;
  } catch {
    waitingCount = null;
  }

  return (
    <StaffProvider approveAction={approveRequestAction}>
      <StaffShell
        facilityName={session.tenantName}
        userName={session.name}
        role={session.role}
        waitingCount={waitingCount}
        signOutAction={signOutAction}
      >
        {children}
      </StaffShell>
    </StaffProvider>
  );
}
