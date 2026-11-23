import type { Metadata } from "next";
import { TymoLogo } from "@tymo/ui";
import { env } from "@tymo/shared/env";

export const metadata: Metadata = { title: "Tymo services" };

const ENDPOINTS = [
  { path: "/api/health", what: "Database readiness", method: "GET" },
  { path: "/api/stripe/webhook", what: "Stripe webhooks (account.updated)", method: "POST" },
  { path: "/api/cron/tick", what: "Sweep: holds, expiry, reminders, completion", method: "POST, Bearer CRON_SECRET" },
  { path: "/dev/outbox", what: "Every email the platform sent (development only)", method: "GET" },
];

/** Tymo's platform services: no public UI, just a status page for people who land here. */
export default function Home() {
  return (
    <main className="court-grid flex min-h-dvh flex-1 flex-col px-5 py-8 text-white">
      <TymoLogo />
      <div className="mx-auto w-full max-w-2xl flex-1 py-16">
        <p className="kicker text-white/70">Tymo services</p>
        <h1 className="display mt-3 text-[clamp(2rem,6vw,3.5rem)]">Platform</h1>
        <p className="mt-4 text-white/80">Payments, webhooks, scheduled jobs and email for every facility on Tymo.</p>
        <ul className="mt-8 divide-y divide-white/10 rounded-[20px] ink-card">
          {ENDPOINTS.filter((e) => env.isProd ? !e.path.startsWith("/dev") : true).map((e) => (
            <li key={e.path} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
              <code className="text-[14px] font-semibold">{e.path}</code>
              <span className="text-[13px] text-white/70">
                {e.what} · {e.method}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
