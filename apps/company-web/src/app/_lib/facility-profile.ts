import "server-only";

interface FacilityProfile {
  slug: string;
  name: string;
  location: string;
  description: string;
  officialSiteUrl: string;
  officialBookingUrl?: string;
  address?: string;
  highlights?: { title: string; description: string }[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function httpsUrl(value: unknown): boolean {
  if (!nonEmpty(value)) return false;
  const url = URL.parse(value);
  return url?.protocol === "https:" && !url.username && !url.password;
}

/** One per deployment. Prospect details live in host configuration. */
export function getFacilityProfile(): FacilityProfile | null {
  const raw = process.env.TYMO_FACILITY_PROFILE;
  if (!raw) return null;

  let profile: FacilityProfile | null;
  try {
    profile = JSON.parse(raw);
  } catch {
    throw new Error("TYMO_FACILITY_PROFILE must contain valid JSON.");
  }

  if (
    !profile ||
    !nonEmpty(profile.slug) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.slug) ||
    profile.slug === "redbud" ||
    !nonEmpty(profile.name) ||
    !nonEmpty(profile.location) ||
    !nonEmpty(profile.description) ||
    !httpsUrl(profile.officialSiteUrl) ||
    (profile.officialBookingUrl !== undefined && !httpsUrl(profile.officialBookingUrl)) ||
    (profile.address !== undefined && !nonEmpty(profile.address)) ||
    (profile.highlights !== undefined && (
      !Array.isArray(profile.highlights) ||
      !profile.highlights.every((item) => item && nonEmpty(item.title) && nonEmpty(item.description))
    ))
  ) {
    throw new Error("TYMO_FACILITY_PROFILE needs a unique slug, name, location, description and HTTPS official site URL.");
  }

  return profile;
}
