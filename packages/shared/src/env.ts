import "server-only";

const trim = (url: string) => url.replace(/\/+$/, "");
const isProduction = process.env.NODE_ENV === "production";

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
  /**
   * Tymo admin console (tymo services /admin) username. The admin1 default
   * is for development only (this repo is public); production needs
   * TYMO_ADMIN_USER or admin sign-in stays off.
   */
  adminUser: process.env.TYMO_ADMIN_USER || (isProduction ? "" : "admin1"),
  /** Admin console password; development default admin1, production needs TYMO_ADMIN_PASSWORD. */
  adminPassword: process.env.TYMO_ADMIN_PASSWORD || (isProduction ? "" : "admin1"),
  /** True when SESSION_SECRET is set (the fallback above is public, so production admin sign-in requires it). */
  sessionSecretSet: !!process.env.SESSION_SECRET,
  /**
   * Inboxes that get a copy of every new booking request (TYMO_REQUEST_COPY_TO,
   * comma-separated). Set per deploy; never put real addresses in this public repo.
   */
  requestCopyTo: (process.env.TYMO_REQUEST_COPY_TO || "")
    .split(",")
    .map((addr) => addr.trim().toLowerCase())
    .filter((addr) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)),
} as const;
