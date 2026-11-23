import { Kicker, Spark } from "@/components/ui";
import { SampleRequest } from "./SampleRequest";

const STEPS = [
  {
    title: "Renters request a time and their card is held.",
    body: "They see open times and prices on your booking page, pick a field or a half, and send a request at any hour. No account, and nothing is charged yet.",
  },
  {
    title: "You approve from your phone.",
    body: "Each request arrives by email. One tap approves it. Decline it, or let it lapse, and the hold drops off the renter's card.",
  },
  {
    title: "The card is charged and the money goes to your bank.",
    body: "Approving charges the card and emails the renter a receipt. Stripe pays out to your bank account.",
  },
];

/** Split section: sticky dark panel with the heading and a sample request, steps beside it. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="bg-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-16 lg:py-24">
        <div className="contours rounded-[28px] p-6 text-white sm:p-8 lg:sticky lg:top-8">
          <Spark className="h-6 w-6" />
          <Kicker className="mt-5 text-white/70">How it works</Kicker>
          <h2 id="how-title" className="display mt-3 text-[clamp(2rem,6.5vw,3.25rem)]">
            Three steps. <span className="text-outline">One is yours.</span>
          </h2>
          <div className="mt-8">
            <SampleRequest />
          </div>
        </div>

        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-[24px] border border-line bg-white p-6 sm:p-8">
              <p className="display text-outline text-[clamp(2.75rem,8vw,4.25rem)] leading-none [--stroke:var(--text)]" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-5 text-[clamp(1.25rem,3.4vw,1.6rem)] font-bold leading-tight tracking-[-0.01em] text-text">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-3 max-w-prose text-[16px] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
