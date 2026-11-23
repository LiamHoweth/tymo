import type { FacilityPublic } from "@tymo/shared/types";
import { cn } from "@tymo/shared/cn";

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w && !/^(the|of|and)$/i.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/**
 * The facility's logo, or a monogram in its brand color when it has none.
 * Decorative next to the facility name, so it carries no alt text.
 */
export function FacilityMark({
  facility,
  size = "md",
  className,
}: {
  facility: Pick<FacilityPublic, "name" | "brand">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "sm" ? "h-8 w-8 text-[11px]" : size === "md" ? "h-11 w-11 text-[14px]" : "h-16 w-16 text-[20px]";
  if (facility.brand.logoUrl) {
    return (
      // Tenant logos come from arbitrary hosts, so next/image's remote allowlist doesn't fit.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={facility.brand.logoUrl}
        alt=""
        className={cn(box, "shrink-0 rounded-xl bg-white object-contain p-1", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        box,
        "display inline-flex shrink-0 items-center justify-center rounded-xl bg-white leading-none text-brand",
        className,
      )}
    >
      {initials(facility.name)}
    </span>
  );
}
