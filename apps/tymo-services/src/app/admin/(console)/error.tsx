"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass } from "@/components/admin/controls";
import { PageFrame } from "@/components/admin/Panel";

/** Error boundary for console pages; the top bar stays usable. */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";

  return (
    <PageFrame>
      <div className="max-w-xl border border-line border-l-2 border-l-danger bg-card px-5 py-6">
        <h1 className="text-[20px] font-semibold leading-tight text-text">This page didn&apos;t load</h1>
        <p className="mt-2 text-[14px] leading-snug text-muted">
          Something went wrong on the server. Try again in a moment. The console only reads data, so nothing changed.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
            Try again
          </button>
          <Link href="/admin" className={buttonClass("secondary")}>
            Go to Requests
          </Link>
        </div>
        {digest ? <p className="mt-4 text-[13px] tabular-nums text-muted">Error code {digest}</p> : null}
      </div>
    </PageFrame>
  );
}
