import Link from "next/link";
import type { ReactNode } from "react";
import type { FacilityPublic } from "@tymo/shared/types";
import { Display, type DisplayLine } from "@tymo/ui";
import { cn } from "@tymo/shared/cn";
import { FacilityMark } from "./FacilityMark";
import { FocusHeading } from "./FocusHeading";
import { ChevronLeft } from "./icons";

export const STEP_COUNT = 5;

const backClass =
  "-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full pr-2 text-[14px] font-medium text-white/75 transition-colors hover:text-white";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={backClass}>
      <ChevronLeft className="h-[18px] w-[18px]" />
      {children}
    </Link>
  );
}

/** Same look as BackLink, for a back step that must run a server action first (release the hold). */
export function BackButton({ action, children }: { action: () => Promise<void>; children: ReactNode }) {
  return (
    <form action={action}>
      <button type="submit" className={backClass}>
        <ChevronLeft className="h-[18px] w-[18px]" />
        {children}
      </button>
    </form>
  );
}

/**
 * Dark court-grid band at the top of each step: facility, "Step 2 of 5",
 * a five-part progress rule, back control, and the step's display title.
 */
export function StepHeader({
  facility,
  step,
  title,
  back,
  children,
}: {
  facility: Pick<FacilityPublic, "slug" | "name" | "brand">;
  step: number;
  title: DisplayLine[];
  back?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="court-grid text-white">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-3 sm:px-6 lg:pb-12">
        <div className="flex items-center justify-between gap-4">
          <Link href={`/book/${facility.slug}`} className="flex min-h-11 min-w-0 items-center gap-2.5">
            <FacilityMark facility={facility} size="sm" />
            <span className="truncate text-[14px] font-semibold">{facility.name}</span>
          </Link>
          <p className="kicker shrink-0 text-white/75">
            Step {step} of {STEP_COUNT}
          </p>
        </div>
        <div aria-hidden className="mt-2 grid grid-cols-5 gap-1.5">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span key={i} className={cn("h-1 rounded-full", i < step ? "bg-accent" : "bg-white/20")} />
          ))}
        </div>
        <div className="mt-4 min-h-11 lg:mt-7">{back}</div>
        <FocusHeading className="mt-1">
          <Display as="span" size="lg" lines={title} className="block" />
        </FocusHeading>
        {children ? <div className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/80">{children}</div> : null}
      </div>
    </header>
  );
}

/** Content column plus (from lg) a sticky summary column on the right. */
export function StepFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 lg:pt-10",
        aside ? "pb-12 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-10 lg:pb-20 xl:gap-16" : "pb-16",
      )}
    >
      <div className="rise-in min-w-0">{children}</div>
      {aside ? <div className="lg:sticky lg:top-6">{aside}</div> : null}
    </div>
  );
}

/** Section label inside a step ("How long?", "Start time"). */
export function StepSection({
  title,
  id,
  aside,
  children,
  className,
}: {
  title: string;
  id?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("mb-9", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[13px] font-bold uppercase tracking-[0.12em] text-text">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
