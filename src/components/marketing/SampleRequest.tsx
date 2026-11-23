/**
 * A sample approval card, drawn the way staff see a request on their phone.
 * Decorative product preview with labeled sample data; not interactive.
 */
export function SampleRequest() {
  return (
    <figure className="ink-card relative overflow-hidden rounded-[24px] p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.7)]">
      <figcaption className="sr-only">
        Sample request: N1 Half A, Tuesday 6:00 to 7:00 PM, $30.00, card held and not charged, with Decline and Approve
        and charge buttons.
      </figcaption>
      <div aria-hidden>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-warn">
            Requested
          </span>
          <span className="text-[12px] text-white/55">Sample · 1 day 22 hr left</span>
        </div>
        <p className="display mt-4 text-[1.6rem] leading-[0.95]">N1 · Half A</p>
        <p className="mt-2 text-[14px] text-white/80">Tue, Dec 8 · 6:00–7:00 PM CT</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-[13px]">
          <div>
            <p className="text-white/50">Renter</p>
            <p className="font-semibold">Storm U12</p>
          </div>
          <div>
            <p className="text-white/50">Card</p>
            <p className="font-semibold">Held, not charged</p>
          </div>
        </div>
        <p className="mt-4 text-[22px] font-bold tabular-nums">$30.00</p>
        <div className="mt-3 flex gap-2">
          <span className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-white/35 px-4 text-[13px] font-semibold">
            Decline
          </span>
          <span className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-full bg-accent px-4 text-[13px] font-semibold text-white">
            Approve and charge
          </span>
        </div>
      </div>
    </figure>
  );
}
