import type { ReactNode } from "react";
import { cn } from "@tymo/shared/cn";

/** Page width and gutters for every admin page: 16px at phone width, up to 1200px wide. */
export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  before,
  after,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Above the heading: a back link or a status line. */
  before?: ReactNode;
  /** Below the description. */
  after?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {before}
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-text md:text-[24px]">{title}</h1>
      {description ? <div className="mt-1 text-[14px] leading-snug text-muted">{description}</div> : null}
      {after}
    </header>
  );
}

/** White content block with a 1px border and an optional titled header row. */
export function Panel({
  title,
  aside,
  children,
  className,
  id,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("border border-line bg-card", className)}>
      {title ? (
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={headingId} className="text-[15px] font-semibold text-text">
            {title}
          </h2>
          {aside ? <div className="text-[13px] text-muted">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Empty or not-found message inside a panel: what this is, why it's empty, and an optional way forward. */
export function EmptyState({
  title,
  children,
  action,
  titleAs: Title = "p",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** "h1" when the empty state is the whole page (not found). */
  titleAs?: "p" | "h1" | "h2";
}) {
  return (
    <div className="border border-line bg-card px-4 py-10 text-center md:px-6">
      <Title className="text-[15px] font-semibold text-text">{title}</Title>
      {children ? <p className="mx-auto mt-1 max-w-md text-[14px] leading-snug text-muted">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Plain bordered note: read-only notices, truncation, unknown filters. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border border-line border-l-2 border-l-muted bg-card px-4 py-3 text-[14px] leading-snug text-text", className)}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse bg-line", className)} />;
}
