import { PageFrame, Skeleton } from "@/components/admin/Panel";

/** Page heading, a summary strip and table rows: close to the shape of every console page. */
export default function AdminLoading() {
  return (
    <PageFrame>
      <div aria-busy="true">
        <p className="sr-only" role="status">
          Loading
        </p>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        <div className="mt-6 grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-card px-4 py-3">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="mt-3 h-6 w-10" />
            </div>
          ))}
        </div>
        <div className="mt-6 border border-line bg-card">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4 border-b border-line px-4 py-4 last:border-b-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="hidden h-4 w-20 md:block" />
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
