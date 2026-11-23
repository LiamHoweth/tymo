import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@tymo/shared/cn";

export type DisplayPart = { text: string; outline?: boolean; accent?: boolean };
export type DisplayLine = string | DisplayPart[];

/**
 * Stacked extra-wide headline with filled and outlined words, e.g.
 *   <Display lines={["Get booked.", [{ text: "Get paid.", outline: true }]]} />
 * `stroke` colors outlined words (defaults to white for dark surfaces).
 */
export function Display({
  lines,
  as: Tag = "h1",
  className,
  stroke,
  size = "xl",
}: {
  lines: DisplayLine[];
  as?: ElementType;
  className?: string;
  stroke?: string;
  size?: "md" | "lg" | "xl" | "2xl";
}) {
  const sizes = {
    md: "text-[clamp(1.5rem,4.5vw,2.25rem)]",
    lg: "text-[clamp(2rem,6.5vw,3.5rem)]",
    xl: "text-[clamp(2.4rem,9vw,5.5rem)]",
    "2xl": "text-[clamp(2.8rem,11vw,7.5rem)]",
  } as const;
  return (
    <Tag className={cn("display", sizes[size], className)} style={stroke ? ({ "--stroke": stroke } as CSSProperties) : undefined}>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {typeof line === "string"
            ? line
            : line.map((part, j) => (
                <span key={j} className={cn(part.outline && "text-outline", part.accent && "text-accent")}>
                  {part.text}
                  {j < line.length - 1 ? " " : null}
                </span>
              ))}
        </span>
      ))}
    </Tag>
  );
}

/** Small uppercase line above a heading. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("kicker", className)}>{children}</p>;
}
