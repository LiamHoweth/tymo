import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "@/lib/env";
import { withSystem } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { getPaymentProvider } from "./index";
import type { ConnectedAccountStatus } from "./types";

/**
 * Connect onboarding for one facility (owner only; callers check the role).
 * Creates the connected account on first use and stores its id, then
 * returns a fresh, short-lived onboarding link. Links expire within
 * minutes, so they are only ever used as an immediate redirect.
 */
export async function createOnboardingUrl(tenantId: string): Promise<string> {
  const provider = await getPaymentProvider();
  const tenant = await loadTenant(tenantId);
  let stripeAccountId = tenant.stripeAccountId;

  // Demo seeds store a fake-provider id. Once real Stripe is switched on,
  // replace it with a real connected account instead of reusing it.
  if (stripeAccountId && provider.mode === "stripe" && stripeAccountId.startsWith("acct_fake_")) {
    const placeholder = stripeAccountId;
    await withSystem((tx) =>
      tx
        .update(tenants)
        .set({ stripeAccountId: null, stripeChargesEnabled: false, stripeDetailsSubmitted: false })
        .where(and(eq(tenants.id, tenantId), eq(tenants.stripeAccountId, placeholder))),
    );
    stripeAccountId = null;
  }

  if (!stripeAccountId) {
    const created = await provider.createConnectedAccount({
      tenantId,
      legalName: tenant.legalName || tenant.name,
      email: tenant.contactEmail,
      websiteUrl: `${env.appUrl}/book/${tenant.slug}`,
      statementDescriptor: tenant.statementDescriptor,
    });
    // Save only if nobody else saved one meanwhile; then use whatever is stored.
    await withSystem((tx) =>
      tx
        .update(tenants)
        .set({ stripeAccountId: created.stripeAccountId })
        .where(and(eq(tenants.id, tenantId), isNull(tenants.stripeAccountId))),
    );
    stripeAccountId = (await loadTenant(tenantId)).stripeAccountId ?? created.stripeAccountId;
  }

  const { url } = await provider.createOnboardingLink({
    stripeAccountId,
    refreshUrl: `${env.appUrl}/api/stripe/connect/start`,
    returnUrl: `${env.appUrl}/api/stripe/connect/return`,
  });
  return url;
}

/** Pull the account's current status from the provider into the tenant's flags. */
export async function refreshConnectStatus(tenantId: string): Promise<ConnectedAccountStatus | null> {
  const tenant = await loadTenant(tenantId);
  if (!tenant.stripeAccountId) return null;
  const provider = await getPaymentProvider();
  const status = await provider.getAccountStatus({ stripeAccountId: tenant.stripeAccountId });
  await withSystem((tx) =>
    tx
      .update(tenants)
      .set({ stripeChargesEnabled: status.chargesEnabled, stripeDetailsSubmitted: status.detailsSubmitted })
      .where(eq(tenants.id, tenantId)),
  );
  return status;
}

async function loadTenant(tenantId: string) {
  const [tenant] = await withSystem((tx) =>
    tx
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        legalName: tenants.legalName,
        contactEmail: tenants.contactEmail,
        statementDescriptor: tenants.statementDescriptor,
        stripeAccountId: tenants.stripeAccountId,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  );
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  return tenant;
}
