import { useId } from "react";
import type { FieldCard } from "@/lib/types";
import { cn } from "@/lib/cn";

type Layout = FieldCard["layout"];
type Rect = { x: number; y: number; w: number; h: number };

const W = 160;
const H = 100;
const P = 2; // inset so strokes aren't clipped

export function partsFor(layout: Layout): Rect[] {
  const fw = W - P * 2;
  const fh = H - P * 2;
  switch (layout) {
    case "split2":
      return [0, 1].map((i) => ({ x: P + (fw / 2) * i, y: P, w: fw / 2, h: fh }));
    case "split3":
      return [0, 1, 2].map((i) => ({ x: P + (fw / 3) * i, y: P, w: fw / 3, h: fh }));
    case "split4":
      return [0, 1, 2, 3].map((i) => ({ x: P + (fw / 2) * (i % 2), y: P + (fh / 2) * Math.floor(i / 2), w: fw / 2, h: fh / 2 }));
    default:
      return [{ x: P, y: P, w: fw, h: fh }];
  }
}

/** Pitch markings: halfway line, centre circle, penalty and goal areas. */
function Markings({ className }: { className?: string }) {
  const cx = W / 2;
  const cy = H / 2;
  return (
    <g className={className} fill="none" strokeWidth={1.25}>
      <line x1={cx} y1={P} x2={cx} y2={H - P} />
      <circle cx={cx} cy={cy} r={13} />
      <circle cx={cx} cy={cy} r={1.2} className="fill-current" />
      <rect x={P} y={cy - 24} width={24} height={48} />
      <rect x={P} y={cy - 11} width={9} height={22} />
      <rect x={W - P - 24} y={cy - 24} width={24} height={48} />
      <rect x={W - P - 9} y={cy - 11} width={9} height={22} />
      <path d={`M${P + 24} ${cy - 9} a 11 11 0 0 1 0 18`} />
      <path d={`M${W - P - 24} ${cy - 9} a 11 11 0 0 0 0 18`} />
    </g>
  );
}

/**
 * A field drawn from above, split into its bookable parts. `filled` lists
 * the part indexes to fill (the chosen or hovered option). `mini` drops the
 * pitch markings for the small icon inside each choice button.
 */
export function FieldDiagram({
  layout,
  filled = [],
  labels,
  mini,
  title,
  className,
}: {
  layout: Layout;
  filled?: number[];
  labels?: string[];
  mini?: boolean;
  title?: string;
  className?: string;
}) {
  const clipId = useId();
  const parts = partsFor(layout);
  const filledParts = parts.filter((_, i) => filled.includes(i));
  const radius = mini ? 9 : 6;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("block", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={`${clipId}-field`}>
          <rect x={P} y={P} width={W - P * 2} height={H - P * 2} rx={radius} />
        </clipPath>
        <clipPath id={`${clipId}-filled`}>
          {filledParts.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />
          ))}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId}-field)`}>
        <rect x={0} y={0} width={W} height={H} className="fill-[color-mix(in_oklab,var(--brand)_7%,white)]" />
        {parts.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            className={cn(
              "transition-[fill] duration-150",
              filled.includes(i) ? "fill-brand" : "fill-transparent",
            )}
          />
        ))}
        {mini ? null : (
          <>
            <Markings className="stroke-[color-mix(in_oklab,var(--brand)_30%,white)] text-[color-mix(in_oklab,var(--brand)_30%,white)]" />
            <g clipPath={`url(#${clipId}-filled)`}>
              <Markings className="stroke-white/45 text-white/45" />
            </g>
          </>
        )}
        {layout !== "single" ? (
          <g
            strokeWidth={mini ? 5 : 2.25}
            strokeDasharray={mini ? undefined : "6 4"}
            className="stroke-[color-mix(in_oklab,var(--brand)_45%,white)]"
          >
            {layout === "split4" ? (
              <>
                <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} />
                <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} />
              </>
            ) : (
              parts.slice(1).map((r, i) => <line key={i} x1={r.x} y1={P} x2={r.x} y2={H - P} />)
            )}
          </g>
        ) : null}
        {!mini && labels
          ? parts.map((r, i) =>
              labels[i] ? (
                <text
                  key={i}
                  x={r.x + r.w / 2}
                  y={r.y + r.h / 2}
                  dy="0.36em"
                  textAnchor="middle"
                  className={cn(
                    "display text-[22px] transition-[fill] duration-150",
                    filled.includes(i) ? "fill-white" : "fill-[color-mix(in_oklab,var(--brand)_55%,white)]",
                  )}
                >
                  {labels[i]}
                </text>
              ) : null,
            )
          : null}
      </g>
      <rect
        x={P}
        y={P}
        width={W - P * 2}
        height={H - P * 2}
        rx={radius}
        fill="none"
        strokeWidth={mini ? 5 : 2}
        className="stroke-[color-mix(in_oklab,var(--brand)_45%,white)]"
      />
    </svg>
  );
}
