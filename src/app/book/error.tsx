"use client";

import { LoadErrorPage } from "@/components/booking/LoadError";

/** The facility itself failed to load (before its branding is known). */
export default function BookError({ retry }: { error: unknown; retry: () => void }) {
  return <LoadErrorPage retry={retry} />;
}
