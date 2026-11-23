import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandScope, ButtonLink, TymoMark } from "@tymo/ui";
import type { Brand } from "@tymo/shared/types";
import { getFacilityProfile } from "@/app/_lib/facility-profile";
import { publicPreview } from "@/app/_lib/public-preview";
import { FacilityPhoto } from "@/components/facility/FacilityPhoto";

const conceptBrand: Brand = { primary: "#12305f", accent: "#bf2537", logoUrl: null };

async function loadProfile({ params }: PageProps<"/facility/[slug]">) {
  const { slug } = await params;
  const profile = publicPreview ? getFacilityProfile() : null;
  if (!profile || slug !== profile.slug) notFound();
  return profile;
}

export async function generateMetadata(props: PageProps<"/facility/[slug]">): Promise<Metadata> {
  const profile = await loadProfile(props);
  return {
    title: { absolute: `${profile.name} · Tymo concept preview` },
    description: `A Tymo facility website concept for ${profile.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function ProspectFacilityPage(props: PageProps<"/facility/[slug]">) {
  const profile = await loadProfile(props);
  const showFacilityDetails = Boolean(profile.address || profile.highlights?.length);
  const officialActionHref = profile.officialBookingUrl ?? profile.officialSiteUrl;
  const officialActionLabel = profile.officialBookingUrl ? "Official field booking" : "Visit the official website";

  return (
    <BrandScope brand={conceptBrand}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-full focus:bg-white focus:px-5 focus:py-3"
      >
        Skip to content
      </a>
      <header className="border-b border-white/15 bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3 sm:px-8">
          <p className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold sm:text-base">
            <TymoMark className="size-6" /> Tymo concept preview
          </p>
          <nav aria-label="Facility" className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:gap-x-8">
            {showFacilityDetails ? (
              <a href="#fields" className="inline-flex min-h-11 items-center text-sm font-semibold text-white/85 hover:text-white">
                Explore the facility
              </a>
            ) : null}
            <a href="#booking-demo" className="inline-flex min-h-11 items-center text-sm font-semibold text-white/85 hover:text-white">
              Tymo sample booking
            </a>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        <section aria-labelledby="facility-title" className="court-grid text-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-7 pt-12 sm:px-8 sm:pb-10 sm:pt-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-10 lg:py-14">
            <div className="flex min-w-0 flex-col items-start justify-center pb-3 lg:py-8">
              <p className="text-sm font-semibold text-white/80">{profile.location}</p>
              <h1 id="facility-title" className="display mt-5 max-w-full text-[clamp(2.3rem,9vw,4.25rem)] leading-[0.96] [overflow-wrap:anywhere] lg:text-[clamp(3rem,4.9vw,4.75rem)]">
                {profile.name}
              </h1>
              <p className="mt-6 max-w-[40ch] text-base leading-relaxed text-white/85 sm:text-lg">{profile.description}</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <ButtonLink href={officialActionHref} size="lg">{officialActionLabel}</ButtonLink>
                {profile.officialBookingUrl ? (
                  <Link
                    href={profile.officialSiteUrl}
                    className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-white underline decoration-white/45 underline-offset-4 hover:decoration-white"
                  >
                    Official website
                  </Link>
                ) : null}
              </div>
            </div>
            <FacilityPhoto />
          </div>
        </section>

        {showFacilityDetails ? (
          <section id="fields" aria-labelledby="fields-title" className="mx-auto w-full max-w-7xl scroll-mt-6 px-4 py-12 sm:px-8 sm:py-16 lg:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="fields-title" className="display text-[clamp(1.95rem,6vw,3.65rem)] leading-tight text-ink">
                Explore the facility
              </h2>
              {profile.address ? <p className="text-base leading-relaxed text-muted">{profile.address}</p> : null}
            </div>
            {profile.highlights?.length ? (
              <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {profile.highlights.map(({ title, description }) => (
                  <li key={title} className="rounded-[24px] border border-line bg-white p-5 sm:p-6">
                    <h3 className="display text-[clamp(1.3rem,5vw,1.65rem)] leading-tight text-ink">{title}</h3>
                    <p className="mt-3 text-base leading-relaxed text-muted">{description}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section id="booking-demo" aria-labelledby="demo-title" className="border-t border-line bg-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:py-16">
            <div className="flex flex-col items-start justify-between gap-6 rounded-[24px] bg-ink p-6 text-white sm:p-9 lg:flex-row lg:items-end">
              <div>
                <h2 id="demo-title" className="display text-[clamp(1.9rem,5.5vw,3.2rem)] leading-tight">
                  Try Tymo sample booking
                </h2>
                <p className="mt-4 max-w-[57ch] text-base leading-relaxed text-white/85">
                  Explore sample fields, rates and availability at Redbud Soccer Complex, a fictional facility. Checkout is disabled in the sample.
                </p>
              </div>
              <ButtonLink href="/book/redbud" variant="white" className="shrink-0">Explore the Redbud sample</ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-5 sm:px-8">
          <p className="text-sm text-white/85">Tymo website concept for {profile.name}</p>
          <Link href={profile.officialSiteUrl} className="inline-flex min-h-11 items-center text-sm font-semibold text-white underline decoration-white/45 underline-offset-4 hover:decoration-white">
            Official website
          </Link>
        </div>
      </footer>
    </BrandScope>
  );
}
