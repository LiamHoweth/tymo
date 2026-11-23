import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Whole-day states on Date and time: closed, too soon, too far, booked all
 * day. Calm, in words, with the next useful step as buttons.
 */
export function DayNotice({
  title,
  children,
  actions,
  tone = "neutral",
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: "neutral" | "closed";
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-[22px] border border-dashed px-5 py-6 sm:px-6",
        tone === "closed" ? "border-[#c3cad6] bg-paper" : "border-line bg-white",
      )}
    >
      <p className="text-[17px] font-semibold leading-snug text-text">{title}</p>
      {children ? <div className="mt-1.5 text-[15px] leading-relaxed text-muted">{children}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
