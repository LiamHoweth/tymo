import type { AdminTone } from "@tymo/company/admin";
import { cn } from "@tymo/shared/cn";

const MARKER: Record<AdminTone, string> = {
  waiting: "bg-warn",
  good: "bg-ok",
  bad: "bg-danger",
  neutral: "bg-muted",
};

/** A status word with a small square marker in its tone. The word carries the meaning; the color only supports it. */
export function StatusMark({ tone, children, className }: { tone: AdminTone; children: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-medium text-text", className)}>
      <span aria-hidden className={cn("h-2 w-2 shrink-0", MARKER[tone])} />
      {children}
    </span>
  );
}
