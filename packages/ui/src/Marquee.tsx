import { Fragment } from "react";
import { cn } from "@tymo/shared/cn";
import { TymoMark } from "./Mark";

/**
 * Ticker band: big wide words separated by the accent mark, scrolling.
 * Decorative: the words are repeated for the loop and hidden from screen
 * readers; pass `label` for an accessible summary.
 */
export function Marquee({
  words,
  label,
  className,
  tone = "volt",
}: {
  words: string[];
  label?: string;
  className?: string;
  tone?: "volt" | "ink" | "brand";
}) {
  const loop = [...words, ...words, ...words, ...words];
  return (
    <div
      className={cn(
        "relative overflow-hidden py-3",
        tone === "volt" && "bg-volt text-ink",
        tone === "ink" && "bg-ink text-white",
        tone === "brand" && "bg-brand text-white",
        className,
      )}
    >
      {label ? <span className="sr-only">{label}</span> : null}
      <div aria-hidden className="flex w-max animate-marquee items-center gap-6 whitespace-nowrap">
        {loop.map((word, i) => (
          <Fragment key={i}>
            <span className="display text-[clamp(1.25rem,3.5vw,2rem)] leading-none">{word}</span>
            <TymoMark className="h-5 w-5 shrink-0 text-accent" />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
