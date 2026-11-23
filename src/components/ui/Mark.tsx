import { cn } from "@/lib/cn";

/**
 * Tymo's mark: a thin square with one open corner and a check breaking
 * out of it. Used as the logo and, small and in the accent color, as the
 * divider glyph between ticker words and above section headings.
 */
export function TymoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-6 w-6", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} fill="none">
      {title ? <title>{title}</title> : null}
      <path d="M20 4H4v24h24V14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
      <path d="M10 15.5l5 5L30 4.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

/** The wordmark: mark + "tymo". */
export function TymoLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <TymoMark className="h-6 w-6" />
      <span className="text-[19px] font-bold tracking-[-0.02em]">tymo</span>
    </span>
  );
}

/** Accent divider glyph (stands in for a section "spark"). */
export function Spark({ className }: { className?: string }) {
  return <TymoMark className={cn("h-5 w-5 text-accent", className)} />;
}
