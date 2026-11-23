import { Card, Skeleton } from "@/components/staff/Page";

export default function BookingLoading() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true" aria-label="Loading the booking">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-3 h-5 w-48" />
      <Skeleton className="mb-3 h-8 w-64 max-w-full" />
      <Skeleton className="mb-7 h-5 w-72 max-w-full" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div className="rounded-card bg-[#1b1e25] p-6 lg:col-start-2 lg:row-start-1">
          <Skeleton className="h-3 w-24 bg-white/15" />
          <Skeleton className="mt-3 h-7 w-28 bg-white/15" />
          <Skeleton className="mt-6 h-12 w-full rounded-full bg-white/15" />
          <Skeleton className="mt-2 h-12 w-full rounded-full bg-white/10" />
        </div>
        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-3 h-4 w-3/4" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
