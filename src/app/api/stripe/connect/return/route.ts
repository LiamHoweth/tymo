import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { refreshConnectStatus } from "@/server/payments/connect";

/** Stripe onboarding return_url: pull the account status into the facility's flags, then back to Settings. */
export async function GET(): Promise<Response> {
  const session = await requireOwner();
  let ok = true;
  try {
    await refreshConnectStatus(session.tenantId);
  } catch (err) {
    ok = false;
    console.error("[stripe] could not refresh account status", err);
  }
  redirect(ok ? "/staff/settings?payouts=updated" : "/staff/settings?payouts=error");
}
