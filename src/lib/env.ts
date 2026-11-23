import "server-only";

/** Server-side configuration. Read once; every value has a dev-safe default. */
export const env = {
  databaseUrl: process.env.DATABASE_URL || "",
  appUrl: process.env.APP_URL || "http://localhost:3000",
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
} as const;
