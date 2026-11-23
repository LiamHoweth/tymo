"use client";

import { catchError, type ErrorInfo } from "next/error";
import { Button, Display, Notice, Spark } from "@tymo/ui";
import { LOAD_FAILED_COPY, callTheDesk, capitalize } from "./copy";
import { useOptionalFacility } from "./FacilityContext";

/**
 * Network error state: "Couldn't load. Check your signal and try again."
 * with a Try again button. Full-page version for error.tsx boundaries.
 */
export function LoadErrorPage({ retry }: { retry: () => void }) {
  const facility = useOptionalFacility();
  return (
    <main className="court-grid flex flex-1 flex-col text-white">
      <div className="rise-in mx-auto my-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <Spark className="mb-5 h-7 w-7" />
        <Display as="h1" size="lg" lines={[[{ text: "Couldn't" }, { text: "load", outline: true }]]} />
        <p role="alert" className="mt-5 max-w-md text-[17px] leading-relaxed text-white/85">
          {LOAD_FAILED_COPY}
        </p>
        <Button size="lg" className="mt-8" onClick={() => retry()}>
          Try again
        </Button>
        {facility?.contactPhone ? (
          <p className="mt-6 text-[14px] text-white/70">Still stuck? {capitalize(callTheDesk(facility))}.</p>
        ) : null}
      </div>
    </main>
  );
}

function InlineFallback(_props: object, { retry }: ErrorInfo) {
  return (
    <Notice
      tone="danger"
      live="assertive"
      actions={
        <Button variant="ghost" size="sm" className="min-h-11" onClick={() => retry()}>
          Try again
        </Button>
      }
    >
      {LOAD_FAILED_COPY}
    </Notice>
  );
}

/** Inline version around one part of a page (e.g. the start times). */
export const InlineLoadError = catchError(InlineFallback);
