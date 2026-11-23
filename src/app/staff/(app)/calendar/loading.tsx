import { Skeleton } from "@/components/staff/Page";

export default function CalendarLoading() {
  return (
    <div className="mx-auto max-w-7xl" aria-busy="true" aria-label="Loading the calendar">
      <div className="mb-7 flex items-end justify-between gap-3">
        <Skeleton className="h-8 w-44" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-24 rounded-full" />
          <Skeleton className="h-11 w-32 rounded-full" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-11 w-40 rounded-full" />
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>
      <div className="mt-4 overflow-hidden rounded-card border border-line bg-white">
        <div className="border-b border-line px-5 py-3">
          <Skeleton className="h-3 w-full" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 border-b border-line px-3 py-3 last:border-b-0 lg:grid-cols-[8.5rem_minmax(0,1fr)] lg:px-5">
            <Skeleton className="h-6 w-10" />
            <Skeleton className="h-7 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
