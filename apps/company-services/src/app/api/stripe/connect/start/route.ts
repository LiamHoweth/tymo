import { redirect } from "next/navigation";
import { requireOwner } from "@tymo/platform/auth";
import { createOnboardingUrl } from "@tymo/platform/payments/connect";

/**
 * Owner taps "Connect payouts": create the facility's Stripe account if it
 * has none, then send the owner to Stripe's hosted onboarding. Also the
 * refresh_url Stripe uses when an onboarding link has expired. In fake
 * payments mode onboarding completes immediately.
 */
export async function GET(): Promise<Response> {
  const session = await requireOwner();
  let url: string | null = null;
  try {
    url = await createOnboardingUrl(session.tenantId);
  } catch (err) {
    console.error("[stripe] could not start onboarding", err);
  }
  redirect(url ?? "/staff/settings?payouts=error");
}
