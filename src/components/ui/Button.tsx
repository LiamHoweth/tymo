import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "accent" | "brand" | "ink" | "white" | "ghost" | "ghostDark" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[0.01em] select-none " +
  "transition-[transform,background-color,box-shadow,border-color,color] duration-150 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<Variant, string> = {
  // The one loud action on a screen ("Send request", "Approve and charge").
  accent: "bg-accent text-white shadow-[0_6px_20px_-6px_var(--accent)] hover:bg-accent-deep",
  brand: "bg-brand text-white hover:bg-brand-deep",
  ink: "bg-ink text-white hover:bg-ink-2",
  white: "bg-white text-ink hover:bg-paper",
  // Outlined pill on light surfaces.
  ghost: "border-[1.5px] border-line bg-white text-text hover:border-text",
  // Outlined pill on dark surfaces.
  ghostDark: "border-[1.5px] border-white/40 text-white hover:border-white hover:bg-white/5",
  danger: "border-[1.5px] border-line bg-white text-danger hover:border-danger",
  quiet: "text-text underline-offset-4 hover:underline",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-12 px-6 text-[15px]",
  lg: "h-14 px-8 text-base",
};

export interface ButtonStyleProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function buttonClass({ variant = "accent", size = "md", block }: ButtonStyleProps, extra?: string) {
  return cn(base, variants[variant], sizes[size], block && "w-full", extra);
}

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ButtonStyleProps & ComponentProps<"button">) {
  return <button type={type} className={buttonClass({ variant, size, block }, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: ButtonStyleProps & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, block }, className)} {...props} />;
}
