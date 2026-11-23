import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Selectable chip, like the product page's "Elongated / Widebody" toggles:
 * outlined when off, filled when on. Use for date chips, durations, start
 * times and field options. Pass `selected`; it sets aria-pressed.
 */
export function Pill({
  selected,
  tone = "light",
  className,
  type = "button",
  ...props
}: { selected?: boolean; tone?: "light" | "dark" } & ComponentProps<"button">) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[14px] font-semibold",
        "border-[1.5px] transition-colors duration-150 disabled:cursor-not-allowed",
        tone === "light" &&
          (selected
            ? "border-ink bg-ink text-white"
            : "border-line bg-white text-text hover:border-text disabled:border-line disabled:bg-paper disabled:text-muted/70 disabled:line-through"),
        tone === "dark" &&
          (selected
            ? "border-white bg-white text-ink"
            : "border-white/35 text-white hover:border-white disabled:text-white/35 disabled:line-through"),
        className,
      )}
      {...props}
    />
  );
}
