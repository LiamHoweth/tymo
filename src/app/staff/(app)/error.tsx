"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { Card } from "@/components/staff/Page";
import { OfflineIcon, AlertIcon } from "@/components/staff/icons";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Error boundary for every staff page; the shell and tab bar stay usable. */
export default function StaffError({ error, retry }: { error: unknown; retry: () => void }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  return (
    <div className="mx-auto max-w-xl">
      <Card className="px-5 py-8 text-center sm:px-8">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-paper text-ink">
          {online ? <AlertIcon className="h-6 w-6" /> : <OfflineIcon className="h-6 w-6" />}
        </div>
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">
          {online ? "This page didn't load." : "No connection."}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-snug text-muted">
          {online
            ? "Something went wrong on our side. Try again in a moment. New requests still reach your email."
            : "Check your signal and try again. Approve and decline need a connection."}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => retry()} variant="ink">
            Try again
          </Button>
          <ButtonLink href="/staff" variant="ghost">
            Go to Approvals
          </ButtonLink>
        </div>
        {digest ? <p className="mt-5 text-[12px] text-muted/80">Error code {digest}</p> : null}
      </Card>
    </div>
  );
}
