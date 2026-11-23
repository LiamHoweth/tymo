import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * A Pill that navigates (e.g. duration choices that live in the URL).
 * Same look as <Pill>: outlined when off, filled when on. The selected one
 * gets aria-current so screen readers announce it as the current choice.
 */
export function PillLink({
  selected,
  tone = "light",
  className,
  ...props
}: { selected?: boolean; tone?: "light" | "dark" } & ComponentProps<typeof Link>) {
  return (
    <Link
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full border-[1.5px] px-4 text-[14px] font-semibold",
        "transition-colors duration-150",
        tone === "light" && (selected ? "border-ink bg-ink text-white" : "border-line bg-white text-text hover:border-text"),
        tone === "dark" && (selected ? "border-white bg-white text-ink" : "border-white/35 text-white hover:border-white"),
        className,
      )}
      {...props}
    />
  );
}
