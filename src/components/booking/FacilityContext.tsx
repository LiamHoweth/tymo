"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FacilityPublic } from "@/lib/types";

const FacilityContext = createContext<FacilityPublic | null>(null);

/** Makes the facility (name, phone, zone, rules) available to client components under /book/[slug]. */
export function FacilityProvider({ facility, children }: { facility: FacilityPublic; children: ReactNode }) {
  return <FacilityContext.Provider value={facility}>{children}</FacilityContext.Provider>;
}

export function useFacility(): FacilityPublic {
  const facility = useContext(FacilityContext);
  if (!facility) throw new Error("useFacility must be used inside FacilityProvider");
  return facility;
}

/** For boundaries (not-found, error) that may render outside a provider. */
export function useOptionalFacility(): FacilityPublic | null {
  return useContext(FacilityContext);
}
