import { Card, Skeleton } from "@/components/staff/Page";

/** Approvals-shaped skeleton (also the fallback for other staff pages). */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-3 h-3 w-28" />
      <Skeleton className="mb-7 h-8 w-56" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-4 sm:p-5">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="mt-4 h-5 w-64 max-w-full" />
            <Skeleton className="mt-3 h-4 w-48" />
            <Skeleton className="mt-2 h-4 w-40" />
            <div className="mt-5 flex gap-2">
              <Skeleton className="h-12 flex-1 rounded-full" />
              <Skeleton className="h-12 w-28 rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
