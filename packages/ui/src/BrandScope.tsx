import type { CSSProperties, ReactNode } from "react";
import type { Brand } from "@tymo/shared/types";
import { cn } from "@tymo/shared/cn";

/** Relative luminance contrast vs white; used to keep accent buttons readable. */
function contrastWithWhite(hex: string): number {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 21;
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05);
}

/**
 * Re-skins everything inside with a facility's colors. If a brand color
 * fails 4.5:1 against white text, it is darkened for buttons and text
 * (spec: "If the complex's color fails, Tymo darkens it").
 */
export function BrandScope({ brand, children, className }: { brand: Brand; children: ReactNode; className?: string }) {
  const fix = (hex: string) =>
    contrastWithWhite(hex) >= 4.5 ? hex : `color-mix(in oklab, ${hex} 70%, black)`;
  const style = { "--brand": fix(brand.primary), "--accent": fix(brand.accent) } as CSSProperties;
  return (
    <div style={style} className={cn("contents", className)}>
      {children}
    </div>
  );
}
