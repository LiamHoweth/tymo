import { SlotsSkeleton } from "./SlotPicker";

const bar = "animate-pulse rounded-full";

/** Dark header placeholder matching StepHeader's shape. */
function HeaderSkeleton() {
  return (
    <div className="court-grid">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-3 sm:px-6 lg:pb-12">
        <div className="flex min-h-11 items-center gap-2.5">
          <div className={`h-8 w-8 rounded-xl bg-white/15 ${bar}`} />
          <div className={`h-3.5 w-40 bg-white/15 ${bar}`} />
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="h-1 rounded-full bg-white/15" />
          ))}
        </div>
        <div className={`mt-8 h-3.5 w-20 bg-white/15 ${bar}`} />
        <div className={`mt-5 h-10 w-64 max-w-full bg-white/15 sm:h-12 sm:w-96 ${bar}`} />
        <div className={`mt-5 h-3.5 w-56 max-w-full bg-white/10 ${bar}`} />
      </div>
    </div>
  );
}

/** Generic step placeholder (route loading). */
export function StepSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-1 flex-col">
      <p className="sr-only" role="status">
        Loading
      </p>
      <HeaderSkeleton />
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-[22px] bg-[#e6eaf1]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Date and time placeholder: date chips, length pills, start times. */
export function TimesSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-1 flex-col">
      <HeaderSkeleton />
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:pt-10">
        <div className="lg:max-w-[calc(100%-400px)]">
          <div className={`mb-3 h-3.5 w-12 bg-line ${bar}`} />
          <div className="-mx-4 flex gap-2 overflow-hidden px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-[72px] w-[76px] shrink-0 animate-pulse rounded-2xl bg-[#e6eaf1] lg:flex-1" />
            ))}
          </div>
          <div className={`mb-3 mt-10 h-3.5 w-20 bg-line ${bar}`} />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={`h-11 w-[4.75rem] bg-[#e6eaf1] ${bar}`} />
            ))}
          </div>
          <div className={`mb-4 mt-10 h-3.5 w-24 bg-line ${bar}`} />
          <SlotsSkeleton />
        </div>
      </div>
    </div>
  );
}
