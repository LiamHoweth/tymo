"use client";

import Link from "next/link";
import { useState } from "react";
import type { FieldCard } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatRate } from "@/lib/format";
import { FieldDiagram, partsFor } from "./FieldDiagram";
import { ArrowRight } from "./icons";

const RULES: Record<FieldCard["layout"], string | null> = {
  single: null,
  split2: "The full field uses both halves.",
  split3: "The full field uses all three thirds.",
  split4: "The full field uses all four quarters.",
};

/** Which diagram parts an option covers: the full field covers all of them. */
function coverage(card: FieldCard): Map<string, number[]> {
  const all = partsFor(card.layout).map((_, i) => i);
  const map = new Map<string, number[]>();
  let next = 0;
  for (const option of card.options) {
    if (option.kind === "part") map.set(option.id, [next++]);
    else map.set(option.id, all);
  }
  return map;
}

/** "Half A" -> "A"; used to letter the parts on the diagram. */
const partLetter = (label: string) => label.trim().split(/\s+/).pop() ?? "";

/**
 * One field on the Choose field screen. Pointing at or focusing a choice
 * fills its part of the drawing, so "Half A" is never a guess.
 */
export function FieldCardView({ card, slug }: { card: FieldCard; slug: string }) {
  const parts = coverage(card);
  const [active, setActive] = useState<string | null>(null);
  const partOptions = card.options.filter((o) => o.kind === "part");
  const labels = card.layout === "single" ? undefined : partOptions.map((o) => partLetter(o.choiceLabel));
  const filled = active ? (parts.get(active) ?? []) : card.layout === "single" ? [0] : [];
  const meta = [card.surface, card.indoor ? "Indoors" : "Outdoors"].filter(Boolean).join(" · ");
  const diagramTitle =
    card.layout === "single"
      ? `${card.name} field plan`
      : `${card.name} field plan, split into ${partOptions.map((o) => o.choiceLabel).join(" and ")}`;

  return (
    <article className="flex flex-col rounded-[22px] border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3
            className={cn(
              "display break-words leading-none text-ink",
              card.name.length > 9 ? "text-[1.45rem]" : "text-[1.85rem]",
            )}
          >
            {card.name}
          </h3>
          {meta ? <p className="mt-2 text-[13px] text-muted">{meta}</p> : null}
        </div>
        <p className="shrink-0 pt-1 text-[13px] font-semibold text-muted">From {formatRate(card.fromPriceCentsPerHour)}</p>
      </div>

      <FieldDiagram layout={card.layout} filled={filled} labels={labels} title={diagramTitle} className="mt-4 w-full" />

      {RULES[card.layout] || card.description ? (
        <p className="mt-3 text-[14px] leading-snug text-muted">
          {[RULES[card.layout], card.description].filter(Boolean).join(" ")}
        </p>
      ) : null}

      <ul className="mt-4 grid gap-2" onMouseLeave={() => setActive(null)}>
        {card.options.map((option) => (
          <li key={option.id}>
            <Link
              href={`/book/${slug}/r/${option.id}`}
              onMouseEnter={() => setActive(option.id)}
              onFocus={() => setActive(option.id)}
              onBlur={() => setActive(null)}
              className="group flex min-h-14 items-center gap-3 rounded-2xl border-[1.5px] border-line px-3 py-2.5 transition-colors hover:border-ink focus-visible:border-ink"
            >
              <FieldDiagram layout={card.layout} filled={parts.get(option.id)} mini className="h-7 w-11 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight text-text">
                  {option.choiceLabel}
                  <span className="sr-only">, </span>
                </span>
                {option.description && option.description !== card.description ? (
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">{option.description}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-text">
                {formatRate(option.priceCentsPerHour)}
              </span>
              <ArrowRight className="h-[18px] w-[18px] text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text" />
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
