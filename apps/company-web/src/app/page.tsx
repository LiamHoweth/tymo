import { redirect } from "next/navigation";
import { env } from "@tymo/shared/env";

/** The company website lives under /book/[slug]; the bare root has no facility. */
export default function Home() {
  redirect(env.demoMode || !env.isProd ? "/book/redbud" : env.tymoWebUrl);
}
