"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { env } from "@tymo/shared/env";
import { consumeMagicLink, createMagicLinkUrl } from "@tymo/platform/auth";
import { withSystem } from "@tymo/db";
import { tenants, users } from "@tymo/db/schema";

/** Seeded demo accounts (fictional facility). Only reachable when TYMO_DEMO=1. */
const DEMO_ACCOUNTS = {
  owner: "owner@redbud.example",
  staff: "staff@redbud.example",
} as const;

export async function demoSignIn(formData: FormData): Promise<void> {
  if (!env.demoMode) redirect("/staff/login");
  const role = formData.get("role") === "staff" ? "staff" : "owner";
  const email = DEMO_ACCOUNTS[role];

  const user = await withSystem(async (tx) => {
    const [row] = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(eq(users.email, email), eq(tenants.slug, "redbud")))
      .limit(1);
    return row ?? null;
  });
  if (!user) redirect("/staff/login?error=invalid");

  // Mint a normal one-time sign-in link and consume it here, so the demo
  // uses the same token and session path as email sign-in. The server
  // action sets the session cookie, then lands on the staff app.
  const url = await createMagicLinkUrl(user.id);
  const token = new URL(url).pathname.split("/").pop() ?? "";
  const result = await consumeMagicLink(token);
  if (!result.ok) redirect(`/staff/login?error=${result.reason}`);
  redirect("/staff");
}
