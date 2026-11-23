import Link from "next/link";
import { ButtonLink, Display, Kicker, Marquee, Spark, TymoLogo } from "@/components/ui";
import { Comparison } from "@/components/marketing/Comparison";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { SiteFooter } from "@/components/marketing/SiteFooter";

const FACTS = [
  { figure: "24/7", line: "Requests come in while the office is closed." },
  { figure: "1", line: "Calendar for every field and court." },
  { figure: "0", line: "Charges until you approve." },
];

/** Tymo's own landing page. Claims are limited to what v1 does. */
export default function Home() {
  return (
    <>
      <main className="flex flex-1 flex-col">
        <section className="court-grid relative flex min-h-[92dvh] flex-col text-white">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-3 sm:px-6">
            <Link href="/" className="inline-flex min-h-11 items-center" aria-label="Tymo home">
              <TymoLogo />
            </Link>
            <Link
              href="/staff"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-[14px] font-semibold text-white/80 hover:text-white"
            >
              Staff sign in
            </Link>
          </div>

          <div className="rise-in mx-auto my-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 text-center sm:px-6">
            <Spark className="mb-6 h-7 w-7" />
            <Kicker className="mb-5 text-white/80">Online booking and payments for sports facilities</Kicker>
            <Display size="2xl" lines={["Get booked.", [{ text: "Get paid.", outline: true }]]} />
            <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-white/85 sm:text-lg">
              Renters pick a time and pay on your website. You approve from your phone. The money goes to your bank.
            </p>
            <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/book/redbud" size="lg">
                See a booking page
              </ButtonLink>
              <ButtonLink href="/staff" size="lg" variant="ghostDark">
                Staff sign in
              </ButtonLink>
            </div>
          </div>
        </section>

        <Marquee
          words={["Field rentals", "Court rentals", "Card held", "You approve", "Paid to your bank"]}
          label="Field and court rentals: the card is held, you approve, and you're paid to your bank."
        />

        <HowItWorks />

        <section aria-label="Tymo in numbers" className="bg-white">
          <ul className="mx-auto grid max-w-6xl gap-px overflow-hidden px-4 py-14 sm:grid-cols-3 sm:px-6 lg:py-20">
            {FACTS.map((fact) => (
              <li key={fact.figure} className="border-line py-6 sm:border-l sm:px-8 sm:first:border-l-0 sm:first:pl-0">
                <p className="display text-[clamp(3.25rem,10vw,5.5rem)] leading-none text-ink">{fact.figure}</p>
                <p className="mt-3 max-w-[16rem] text-[16px] leading-snug text-muted">{fact.line}</p>
              </li>
            ))}
          </ul>
        </section>

        <Comparison />

        <section className="court-grid text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:py-28">
            <div>
              <Spark className="mb-5 h-6 w-6" />
              <Display as="h2" size="lg" lines={["Take rentals online,", [{ text: "not on your voicemail.", outline: true }]]} />
              <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/85">
                We set it up for you. One short call, and we build your booking page.
              </p>
            </div>
            <ButtonLink href="/book/redbud" size="lg" className="shrink-0">
              See a booking page
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
