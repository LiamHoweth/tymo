"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Last path whose heading took focus. Module scope so a Suspense re-mount on
// the same step (e.g. new times loading) doesn't steal focus again.
let lastPath: string | null = null;

/**
 * The step's h1. When the step changes it takes focus, so keyboard and
 * screen reader users land on the new step's title. The first page load
 * is left alone.
 */
export function FocusHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (lastPath === null) {
      lastPath = pathname;
      return;
    }
    if (lastPath === pathname) return;
    lastPath = pathname;
    ref.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    // Inline style: the global :focus-visible ring is unlayered and would win over a utility class.
    <h1 ref={ref} tabIndex={-1} className={cn("outline-none", className)} style={{ outline: "none" }}>
      {children}
    </h1>
  );
}
