import type { ReactNode } from "react";
import { cn } from "@tymo/shared/cn";

type Tone = "info" | "ok" | "warn" | "danger";

/**
 * A boxed message: policy boxes, hold explanations, and every error state.
 * The tone colors a left rule and a small label; the words carry the meaning.
 * Pass `live="assertive"` for errors that appear after an action.
 */
export function Notice({
  tone = "info",
  title,
  children,
  actions,
  live,
  className,
  id,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  live?: "polite" | "assertive";
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      role={live === "assertive" ? "alert" : live === "polite" ? "status" : undefined}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-white px-4 py-3.5 pl-5 text-[15px] leading-relaxed text-text",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        tone === "info" && "border-line before:bg-brand",
        tone === "ok" && "border-[color-mix(in_oklab,var(--ok)_30%,white)] before:bg-ok",
        tone === "warn" && "border-[color-mix(in_oklab,var(--warn)_30%,white)] bg-warn-soft before:bg-warn",
        tone === "danger" && "border-[color-mix(in_oklab,var(--danger)_30%,white)] bg-[#fdf2f3] before:bg-danger",
        className,
      )}
    >
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children ? <div className="text-text/90">{children}</div> : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
