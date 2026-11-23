import { ButtonLink, Display, Kicker, Marquee, Spark, TymoLogo } from "@/components/ui";

// Placeholder home; the customer-UI module replaces this with the full landing page.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="court-grid relative flex min-h-[78dvh] flex-col px-5 pb-16 pt-6 text-white">
        <TymoLogo />
        <div className="mx-auto mt-auto flex max-w-5xl flex-col items-center text-center">
          <Spark className="mb-5 h-7 w-7" />
          <Kicker className="mb-4 text-white/80">Bookings and payments for sports facilities</Kicker>
          <Display size="2xl" lines={["Get booked.", [{ text: "Get paid.", outline: true }]]} />
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/book/redbud" size="lg">
              See a booking page
            </ButtonLink>
            <ButtonLink href="/staff" size="lg" variant="ghostDark">
              Staff sign in
            </ButtonLink>
          </div>
        </div>
      </section>
      <Marquee words={["Request", "Approve", "Get paid", "Every field", "Every half"]} label="Request, approve, get paid" />
    </main>
  );
}
