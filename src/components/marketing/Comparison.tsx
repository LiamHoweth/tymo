import { Display, Spark } from "@/components/ui";
import { cn } from "@/lib/cn";

const ROWS: { topic: string; paper: string; tymo: string }[] = [
  {
    topic: "Taking a request",
    paper: "Voicemail, then a callback, then phone tag.",
    tymo: "Renters see open times and send a request at any hour.",
  },
  {
    topic: "Getting paid",
    paper: "Cash or a check at the desk, if they remember.",
    tymo: "The card is held with the request and charged when you approve.",
  },
  {
    topic: "Double bookings",
    paper: "Two names penciled into one box.",
    tymo: "Can't happen. A half and its full field block each other.",
  },
  {
    topic: "Waivers",
    paper: "A clipboard at the front desk.",
    tymo: "Renters agree to your waiver before they pay. The record stays with the booking.",
  },
  {
    topic: "Regulars and closures",
    paper: "Written in, erased, written in again.",
    tymo: "Weekly renters, holidays and tournaments block their time on one calendar.",
  },
  {
    topic: "Cancellations",
    paper: "A call you have to return.",
    tymo: "Renters cancel from their link. Refunds follow your policy.",
  },
];

/** Dark comparison table with alternating rows. A table from md up; stacked cards on phones. */
export function Comparison() {
  return (
    <section aria-labelledby="compare-title" className="bg-ink text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <Spark className="mb-5 h-6 w-6" />
        <h2 id="compare-title">
          <Display as="span" size="lg" className="block" lines={["Phone and paper", [{ text: "vs Tymo", outline: true }]]} />
        </h2>

        <table className="mt-12 hidden w-full border-collapse text-left md:table">
          <thead>
            <tr className="text-[12px] uppercase tracking-[0.14em] text-white/55">
              <th scope="col" className="w-[22%] pb-4 pl-6 font-semibold">
                <span className="sr-only">Task</span>
              </th>
              <th scope="col" className="w-[36%] pb-4 font-semibold">
                Phone and paper
              </th>
              <th scope="col" className="pb-4 pr-6 font-semibold text-white">
                Tymo
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={row.topic} className={cn(i % 2 === 0 ? "bg-white/[0.06]" : "bg-transparent")}>
                <th scope="row" className="rounded-l-2xl py-6 pl-6 pr-4 align-top text-[15px] font-semibold">
                  {row.topic}
                </th>
                <td className="py-6 pr-6 align-top text-[15px] leading-relaxed text-white/60">{row.paper}</td>
                <td className="rounded-r-2xl py-6 pr-6 align-top text-[16px] font-medium leading-relaxed">{row.tymo}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="mt-10 space-y-2 md:hidden">
          {ROWS.map((row, i) => (
            <li key={row.topic} className={cn("rounded-2xl p-5", i % 2 === 0 ? "bg-white/[0.07]" : "bg-transparent")}>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/55">{row.topic}</p>
              <p className="mt-3 text-[16px] font-medium leading-snug">
                <span className="sr-only">With Tymo: </span>
                {row.tymo}
              </p>
              <p className="mt-2 text-[14px] leading-snug text-white/60">
                <span className="font-semibold text-white/70">Phone and paper: </span>
                {row.paper}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
