import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Display, Kicker, type DisplayPart } from "@/components/ui";
import { AlertIcon, ChevronLeft } from "./icons";

/**
 * Page title in the display face. Staff pages keep it compact: one line,
 * an optional outlined word, an optional kicker and actions on the right.
 */
export function PageHeader({
  title,
  kicker,
  sub,
  actions,
  back,
  className,
}: {
  title: DisplayPart[];
  kicker?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn("mb-5 lg:mb-7", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-full pl-1 pr-3 text-[14px] font-semibold text-muted hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {kicker ? <Kicker className="mb-2 text-muted">{kicker}</Kicker> : null}
          <Display as="h1" size="md" stroke="var(--ink)" className="text-ink" lines={[title]} />
          {sub ? <div className="mt-2 text-[15px] leading-snug text-muted">{sub}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** White card used for every content block on staff pages. */
export function Card({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li" }) {
  return <Tag className={cn("rounded-card border border-line bg-card", className)}>{children}</Tag>;
}

/** Section heading inside a card or page. */
export function SectionTitle({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[17px] font-bold tracking-[-0.01em] text-ink">
        {children}
      </h2>
      {aside ? <div className="text-[13px] text-muted">{aside}</div> : null}
    </div>
  );
}

/** Calm inline notice (owner-only, bookings off, payouts unfinished). */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warn";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center",
        tone === "warn" ? "border-[#f0d19b] bg-warn-soft text-[#5e3906]" : "border-line bg-white text-text",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        {tone === "warn" ? <AlertIcon className="mt-0.5 h-5 w-5 text-warn" /> : null}
        <div className="min-w-0 text-[14.5px] leading-snug">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn(title && "mt-0.5", tone === "warn" ? "text-[#6b4108]" : "text-muted")}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Label/value rows for detail screens. */
export function DetailRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4", className)}>
      <dt className="shrink-0 text-[13px] font-semibold text-muted sm:w-40 sm:pt-px">{label}</dt>
      <dd className="min-w-0 text-[15px] leading-snug text-text">{children}</dd>
    </div>
  );
}

/** Grey shimmer block for loading skeletons. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-[#e3e8f0]", className)} />;
}
