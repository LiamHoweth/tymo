import { Card, Skeleton } from "@/components/staff/Page";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="mb-7 h-8 w-48" />
      <div className="flex flex-col gap-5">
        {[3, 2, 6, 4].map((rows, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="mb-4 h-5 w-40" />
            {Array.from({ length: rows }, (_, j) => (
              <div key={j} className="flex justify-between gap-4 py-2.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
