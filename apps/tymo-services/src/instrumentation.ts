/**
 * Optional in-process scheduler for single-instance hosts (Railway): when
 * TYMO_INTERNAL_CRON=1, call /api/cron/tick once a minute so holds expire,
 * requests time out and staff reminders go out without an external cron.
 * It calls the route over HTTP so the sweep runs in the normal request
 * context with the same CRON_SECRET check as an external scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.TYMO_INTERNAL_CRON !== "1") return;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron] TYMO_INTERNAL_CRON=1 but CRON_SECRET is not set; scheduler disabled.");
    return;
  }
  const g = globalThis as { __tymoCron?: ReturnType<typeof setInterval> };
  if (g.__tymoCron) return;

  const port = process.env.PORT || "3000";
  const tick = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cron/tick`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      if (!res.ok) console.warn(`[cron] tick returned ${res.status}`);
    } catch (err) {
      console.warn("[cron] tick failed:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(tick, 20_000);
  g.__tymoCron = setInterval(tick, 60_000);
  console.info("[cron] internal scheduler started (every 60 s).");
}
