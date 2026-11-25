import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@tymo/shared/cn";
import { ChevronLeftIcon, ExternalIcon } from "./icons";

/** Square buttons: ink for the one primary action, outlined for everything else. */
export function buttonClass(variant: "primary" | "secondary" = "secondary", className?: string): string {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-none px-4 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    variant === "primary" ? "bg-ink text-white hover:bg-ink-2" : "border border-line bg-card text-text hover:border-text",
    className,
  );
}

/** Text inputs and selects. 16px text so phones don't zoom on focus. */
export const inputClass =
  "block h-11 w-full rounded-none border border-line bg-card px-3 text-[16px] text-text hover:border-muted aria-[invalid=true]:border-danger";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-[14px] font-medium text-muted hover:text-text"
    >
      <ChevronLeftIcon />
      {children}
    </Link>
  );
}

/** A link to another site or app, opened in a new tab and announced as such. */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex min-h-11 items-center gap-1.5 font-medium text-text underline underline-offset-4 decoration-line hover:decoration-text", className)}
    >
      {children}
      <ExternalIcon />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
