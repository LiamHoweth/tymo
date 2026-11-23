"use client";

import { LoadErrorPage } from "@/components/booking/LoadError";

/** A facility page failed to load: "Couldn't load. Check your signal and try again." */
export default function FacilityError({ retry }: { error: unknown; retry: () => void }) {
  return <LoadErrorPage retry={retry} />;
}
