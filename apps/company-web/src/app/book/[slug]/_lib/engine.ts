import "server-only";
import { cache } from "react";
import * as live from "@tymo/company/public";
import { publicPreview } from "@/app/_lib/public-preview";

/**
 * The booking UI's only door to the engine (src/server/booking/public.ts).
 * Reads are wrapped in React cache() so a layout, page and metadata can ask
 * for the same facility in one request without a second query.
 *
 * Dev only: with TYMO_UI_FIXTURES=1 (and NODE_ENV !== "production") the UI
 * runs against in-memory fixtures so layouts and states can be checked
 * before the engine is wired up. Production never loads the fixtures.
 */
type Engine = typeof live;

const useFixtures = process.env.NODE_ENV !== "production" && process.env.TYMO_UI_FIXTURES === "1";

async function engine(): Promise<Engine> {
  if (useFixtures) return (await import("./fixtures")).fixtureEngine;
  return live;
}

export const getFacility = cache(async (slug: string) => {
  const facility = await (await engine()).getFacility(slug);
  return facility && publicPreview
    ? { ...facility, address: null, contactPhone: null, contactEmail: null }
    : facility;
});
export const getFieldGroups = cache(async (slug: string) => (await engine()).getFieldGroups(slug));
export const getDateChips = cache(async (slug: string, resourceId: string, days: number) =>
  (await engine()).getDateChips(slug, resourceId, days),
);
export const getDayAvailability = cache(async (slug: string, resourceId: string, date: string, minutes: number) =>
  (await engine()).getDayAvailability(slug, resourceId, date, minutes),
);
export const getBookingByToken = cache(async (slug: string, token: string) =>
  (await engine()).getBookingByToken(slug, token),
);

export const startCheckout: Engine["startCheckout"] = async (...args) => (await engine()).startCheckout(...args);
export const saveCheckoutDetails: Engine["saveCheckoutDetails"] = async (...args) =>
  (await engine()).saveCheckoutDetails(...args);
export const preparePayment: Engine["preparePayment"] = async (...args) => (await engine()).preparePayment(...args);
export const submitRequest: Engine["submitRequest"] = async (...args) => (await engine()).submitRequest(...args);
export const abandonCheckout: Engine["abandonCheckout"] = async (...args) => (await engine()).abandonCheckout(...args);
export const cancelByToken: Engine["cancelByToken"] = async (...args) => (await engine()).cancelByToken(...args);

/** Find one bookable option (and its field card) by resource id. */
export async function findResource(slug: string, resourceId: string) {
  const groups = await getFieldGroups(slug);
  for (const group of groups) {
    for (const card of group.cards) {
      const option = card.options.find((o) => o.id === resourceId);
      if (option) return { group, card, option };
    }
  }
  return null;
}
