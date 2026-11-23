import "server-only";

const trim = (url: string) => url.replace(/\/+$/, "");

/** Server-side configuration. Read once; every value has a dev-safe default. */
export const env = {
  databaseUrl: process.env.DATABASE_URL || "",
  /** Company website (renter booking pages). */
  companyWebUrl: trim(process.env.COMPANY_WEB_URL || process.env.APP_URL || "http://localhost:3000"),
  /** Company services (staff app, sign-in links, Stripe Connect return). */
  companyServicesUrl: trim(process.env.COMPANY_SERVICES_URL || process.env.APP_URL || "http://localhost:3001"),
  /** Tymo services (Stripe webhooks, cron, dev outbox). */
  tymoServicesUrl: trim(process.env.TYMO_SERVICES_URL || "http://localhost:3002"),
  /** Tymo's marketing website. */
  tymoWebUrl: trim(process.env.TYMO_WEB_URL || "http://localhost:3003"),
  sessionSecret: process.env.SESSION_SECRET || "dev-only-session-secret-change-me",
  cronSecret: process.env.CRON_SECRET || "dev-cron-secret",
  paymentsMode: (process.env.PAYMENTS_MODE ||
    (process.env.STRIPE_SECRET_KEY ? "stripe" : "fake")) as "stripe" | "fake",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  tymoFeeBps: Number(process.env.TYMO_FEE_BPS || 200),
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "bookings@booktymo.com",
  isProd: process.env.NODE_ENV === "production",
  /** Public demo deployment: shows one-tap sign-in for the seeded demo staff. Never set for a real facility. */
  demoMode: process.env.TYMO_DEMO === "1",
} as const;
