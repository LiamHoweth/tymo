import { redirect } from "next/navigation";
import { connection } from "next/server";
import { env } from "@tymo/shared/env";
import { getFacilityProfile } from "./_lib/facility-profile";
import { publicPreview } from "./_lib/public-preview";

/** The demo service opens its facility site. Other deployments use their tenant links. */
export default async function Home() {
  await connection();
  if (publicPreview) {
    const profile = getFacilityProfile();
    redirect(`/facility/${profile?.slug ?? "redbud"}`);
  }
  redirect(env.demoMode || !env.isProd ? "/facility/redbud" : env.tymoWebUrl);
}
