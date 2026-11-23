import { ButtonLink, Display, Spark, TymoLogo } from "@/components/ui";

/** Unknown facility slug. */
export default function BookNotFound() {
  return (
    <main className="court-grid flex flex-1 flex-col text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-5 sm:px-6">
        <TymoLogo />
        <div className="rise-in my-auto max-w-2xl py-16">
          <Spark className="mb-5 h-7 w-7" />
          <Display as="h1" size="lg" lines={[[{ text: "Page not" }, { text: "found", outline: true }]]} />
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/85">
            We can&apos;t find a booking page at this address. Check the link on the facility&apos;s website, or ask the
            front desk for it.
          </p>
          <ButtonLink href="/" size="lg" variant="ghostDark" className="mt-8">
            Go to Tymo
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
