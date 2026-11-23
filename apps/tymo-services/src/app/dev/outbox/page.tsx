import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { ButtonLink, Display, Kicker, StatusTag, TymoLogo } from "@tymo/ui";
import { env } from "@tymo/shared/env";
import { withSystem } from "@tymo/db";
import { emailOutbox, tenants } from "@tymo/db/schema";

export const metadata: Metadata = { title: "Dev outbox", robots: { index: false } };

/** Links in an email body, in order, without duplicates. */
function linksIn(html: string): string[] {
  const found = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  return [...new Set(found)];
}

/** Open links in the top window so sign-in links set the cookie on the real page. */
function previewDoc(html: string): string {
  return html.includes("<head>") ? html.replace("<head>", '<head><base target="_top">') : `<base target="_top">${html}`;
}

function when(at: Date): string {
  const seconds = Math.round((Date.now() - at.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr ago`;
  return at.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/**
 * Development-only view of every email Tymo "sent": newest first, across
 * tenants, with a rendered preview so sign-in links are clickable.
 */
export default async function DevOutboxPage() {
  await connection();
  if (env.isProd) notFound();

  const rows = await withSystem((tx) =>
    tx
      .select({
        id: emailOutbox.id,
        kind: emailOutbox.kind,
        toEmail: emailOutbox.toEmail,
        fromName: emailOutbox.fromName,
        replyTo: emailOutbox.replyTo,
        subject: emailOutbox.subject,
        html: emailOutbox.html,
        text: emailOutbox.text,
        createdAt: emailOutbox.createdAt,
        sentAt: emailOutbox.sentAt,
        error: emailOutbox.error,
        tenantName: tenants.name,
      })
      .from(emailOutbox)
      .leftJoin(tenants, eq(tenants.id, emailOutbox.tenantId))
      .orderBy(desc(emailOutbox.createdAt))
      .limit(50),
  );

  return (
    <main className="flex flex-1 flex-col bg-paper">
      <header className="court-grid px-5 pb-8 pt-6 text-white">
        <div className="mx-auto max-w-3xl">
          <TymoLogo />
          <Kicker className="mt-8 mb-3 text-white/75">Development only</Kicker>
          <Display as="h1" size="md" lines={[[{ text: "Dev" }, { text: "outbox", outline: true }]]} />
          <p className="mt-3 text-[15px] text-white/80">
            Newest first, all facilities, last 50. {env.resendApiKey ? "Resend delivery is on." : "Nothing is delivered: RESEND_API_KEY is not set."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/dev/outbox" variant="white" size="sm">
              Refresh
            </ButtonLink>
            <ButtonLink href="/staff/login" variant="ghostDark" size="sm">
              Staff sign in
            </ButtonLink>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-5">
        {rows.length === 0 ? (
          <div className="rounded-card bg-white p-6 text-center">
            <p className="font-semibold">No emails yet.</p>
            <p className="mt-1 text-[14px] text-muted">Request a sign-in link or send a booking request and it shows up here.</p>
          </div>
        ) : null}

        {rows.map((row, i) => {
          const links = linksIn(row.html);
          return (
            <article key={row.id} className="overflow-hidden rounded-card border border-line bg-white">
              <div className="flex flex-col gap-2 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {row.error ? (
                    <StatusTag tone="danger">Failed</StatusTag>
                  ) : row.sentAt ? (
                    <StatusTag tone="ok">Sent</StatusTag>
                  ) : (
                    <StatusTag tone="neutral">Not delivered</StatusTag>
                  )}
                  <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{row.kind}</span>
                  <span className="ml-auto text-[13px] text-muted">{when(row.createdAt)}</span>
                </div>
                <h2 className="text-[17px] font-bold leading-snug">{row.subject}</h2>
                <p className="text-[13px] text-muted">
                  To <span className="font-semibold text-text">{row.toEmail}</span> · from {row.fromName}
                  {row.tenantName && row.tenantName !== row.fromName ? ` (${row.tenantName})` : ""}
                  {row.replyTo ? ` · reply-to ${row.replyTo}` : ""}
                </p>
                {row.error ? <p className="rounded-xl bg-[#fbeaec] px-3 py-2 text-[13px] text-danger">{row.error}</p> : null}
                {links.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {links.map((href) => (
                      <li key={href} className="truncate text-[13px]">
                        <a href={href} className="font-medium text-brand underline underline-offset-2">
                          {href}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {row.html ? (
                <details open={i === 0} className="border-t border-line">
                  <summary className="cursor-pointer px-4 py-3 text-[14px] font-semibold sm:px-5">Preview</summary>
                  <iframe
                    title={`Preview: ${row.subject}`}
                    srcDoc={previewDoc(row.html)}
                    sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                    className="block h-[640px] w-full border-0 bg-paper"
                  />
                </details>
              ) : null}
              <details className="border-t border-line">
                <summary className="cursor-pointer px-4 py-3 text-[14px] font-semibold sm:px-5">Plain text</summary>
                <pre className="overflow-x-auto whitespace-pre-wrap px-4 pb-4 text-[13px] leading-relaxed text-text sm:px-5">{row.text}</pre>
              </details>
            </article>
          );
        })}
      </div>
    </main>
  );
}
