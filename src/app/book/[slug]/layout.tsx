import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandScope } from "@/components/ui";
import { FacilityProvider } from "@/components/booking/FacilityContext";
import { getFacility } from "./_lib/engine";

export async function generateMetadata(props: LayoutProps<"/book/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  try {
    const facility = await getFacility(slug);
    if (!facility) return {};
    return {
      // The facility's page, not Tymo's: no "· Tymo" suffix from the root template.
      title: { absolute: `Book a field · ${facility.name}`, template: `%s · ${facility.name}` },
      description: `See open times and prices at ${facility.name} and request a field online.`,
    };
  } catch {
    return {};
  }
}

/** Every /book/[slug] page: resolve the facility, then re-skin with its colors. */
export default async function FacilityLayout(props: LayoutProps<"/book/[slug]">) {
  const { slug } = await props.params;
  const facility = await getFacility(slug);
  if (!facility) notFound();

  return (
    <FacilityProvider facility={facility}>
      <BrandScope brand={facility.brand}>
        <div className="flex min-h-dvh flex-col">{props.children}</div>
      </BrandScope>
    </FacilityProvider>
  );
}
