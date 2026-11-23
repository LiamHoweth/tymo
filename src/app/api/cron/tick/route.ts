import { env } from "@/lib/env";
import { isAuthorizedBearer } from "@/server/auth/cron";
import { runSweep } from "@/server/booking/jobs";

/**
 * Minute tick for the sweeper (expire holds and requests, reminders,
 * completion, weekly block occurrences). Call with
 * `Authorization: Bearer $CRON_SECRET`; GET or POST.
 */
async function tick(request: Request): Promise<Response> {
  if (env.isProd && !process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (!isAuthorizedBearer(request.headers.get("authorization"), env.cronSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runSweep();
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cron] sweep failed", err);
    return Response.json({ error: "Sweep failed" }, { status: 500 });
  }
}

export const GET = tick;
export const POST = tick;
