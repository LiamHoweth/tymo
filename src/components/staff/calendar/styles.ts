import type { CSSProperties } from "react";
import type { CalendarItemKind } from "@/lib/types";

/**
 * One visual per kind, never color alone: bookings solid, requests
 * outlined, blocks hatched, closures grey, checkout holds dashed. Every
 * segment also carries its words in an aria-label or visible label.
 */
export const KIND_CLASS: Record<CalendarItemKind, string> = {
  booking: "bg-brand text-white",
  request: "bg-white text-brand ring-[1.5px] ring-inset ring-brand",
  block: "text-ink ring-1 ring-inset ring-[#9aa4b4]",
  closure: "bg-[#c3c9d4] text-ink",
  hold: "bg-paper text-muted border border-dashed border-[#8a93a3]",
};

export const HATCH: CSSProperties = {
  backgroundColor: "#eef1f6",
  backgroundImage: "repeating-linear-gradient(135deg, rgb(88 98 116 / 0.5) 0 1.5px, transparent 1.5px 6px)",
};

export function kindStyle(kind: CalendarItemKind): CSSProperties | undefined {
  return kind === "block" ? HATCH : undefined;
}

/** Label chip so text stays readable on the hatch. */
export const LABEL_ON_HATCH = "rounded-[4px] bg-[#eef1f6]/95 px-1";
