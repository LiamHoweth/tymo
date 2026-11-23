"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApprovalQueueItem, StaffActionResult } from "@/lib/types";
import { formatCents, formatPhone } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { useStaff } from "../StaffProvider";
import { DeclineSheet, type DeclineTarget } from "../DeclineSheet";
import { AlertIcon, CheckIcon, ClockIcon, PhoneIcon } from "../icons";
import { expiresInLabel } from "../format";

const URGENT_MS = 2 * 60 * 60 * 1000;

/** Ticks the countdown every 30 s; starts from the server's label. */
function useDeadline(deadlineIso: string, initialLabel: string, initialUrgent: boolean) {
  const [state, setState] = useState({ label: initialLabel, urgent: initialUrgent });
  useEffect(() => {
    const deadline = new Date(deadlineIso).getTime();
    const tick = () => {
      const left = deadline - Date.now();
      setState({ label: expiresInLabel(left), urgent: left < URGENT_MS });
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [deadlineIso]);
  return state;
}

/** The queue: waiting requests, soonest deadline first (urgent ones are on top). */
export function ApprovalQueue({
  items,
  declineAction,
}: {
  items: ApprovalQueueItem[];
  declineAction: (bookingId: string, reason: string) => Promise<StaffActionResult>;
}) {
  const { isApproving, isHidden } = useStaff();
  const [declining, setDeclining] = useState<DeclineTarget | null>(null);
  const visible = items.filter((i) => !isApproving(i.bookingId) && !isHidden(i.bookingId));

  return (
    <section aria-labelledby="queue-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="queue-heading" className="text-[17px] font-bold tracking-[-0.01em] text-ink">
          {visible.length === 0 ? "Requests" : `${visible.length} waiting`}
        </h2>
        {visible.length > 1 ? <p className="text-[13px] text-muted">Soonest deadline first</p> : null}
      </div>

      {visible.length === 0 ? (
        <EmptyQueue />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => (
            <li key={item.bookingId}>
              <ApprovalCard
                item={item}
                onDecline={() =>
                  setDeclining({ bookingId: item.bookingId, customerName: item.customerName, priceCents: item.priceCents })
                }
              />
            </li>
          ))}
        </ul>
      )}

      <DeclineSheet target={declining} onClose={() => setDeclining(null)} declineAction={declineAction} />
    </section>
  );
}

function ApprovalCard({ item, onDecline }: { item: ApprovalQueueItem; onDecline: () => void }) {
  const { approve, online } = useStaff();
  const { label, urgent } = useDeadline(item.approvalDeadlineAt, item.expiresInLabel, item.urgent);
  const price = formatCents(item.priceCents);
  const tel = item.customerPhone.replace(/[^\d+]/g, "");

  return (
    <article
      aria-label={`${item.resourceCode} request from ${item.customerName}`}
      className={cn(
        "rounded-card border bg-card p-4 sm:p-5",
        urgent ? "border-[#e6b35e] shadow-[inset_4px_0_0_var(--warn)]" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/staff/bookings/${item.bookingId}`}
          className="-my-1 min-w-0 rounded-md py-1 text-[15px] font-bold text-ink underline-offset-4 hover:underline"
        >
          {item.resourceLabel}
        </Link>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold tabular-nums",
            urgent ? "rounded-full bg-warn-soft px-2.5 py-1 text-warn" : "pt-0.5 text-muted",
          )}
        >
          {urgent ? <AlertIcon className="h-4 w-4" /> : <ClockIcon className="h-4 w-4" />}
          Expires in {label}
        </span>
      </div>

      <p className="mt-2 text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink">{item.whenLabel}</p>

      <div className="mt-2 space-y-1 text-[15px] leading-snug text-text">
        <p className="flex flex-wrap items-center gap-x-1.5">
          <span>{item.customerName}</span>
          <span className="text-muted" aria-hidden>
            ·
          </span>
          <a
            href={`tel:${tel}`}
            className="-my-2.5 inline-flex min-h-11 items-center gap-1.5 font-semibold tabular-nums text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
          >
            <PhoneIcon className="h-4 w-4" />
            <span className="sr-only">Call </span>
            {formatPhone(item.customerPhone)}
          </a>
        </p>
        {item.team ? <p className="text-[14px] text-muted">{item.team}</p> : null}
        <p>
          <span className="font-semibold tabular-nums">{price}</span>
          <span className="text-muted"> · Card held, not charged</span>
        </p>
        {item.waiverAccepted ? (
          <p className="flex items-center gap-1.5 text-[14px] font-medium text-ok">
            <CheckIcon className="h-4 w-4" />
            Waiver accepted
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[14px] font-medium text-danger">
            <AlertIcon className="h-4 w-4" />
            Waiver not accepted
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 min-[480px]:grid-cols-[1fr_auto]">
        <Button
          variant="accent"
          disabled={!online}
          onClick={() => approve({ bookingId: item.bookingId, customerName: item.customerName, priceCents: item.priceCents })}
        >
          Approve and charge {price}
        </Button>
        <Button variant="ghost" onClick={onDecline} disabled={!online}>
          Decline
        </Button>
      </div>
    </article>
  );
}

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-[#c9d1dd] bg-white/60 px-6 py-12 text-center">
      <svg viewBox="0 0 120 72" aria-hidden className="mb-5 h-14 w-24 text-[#b9c3d2]" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="116" height="68" rx="3" />
        <path d="M60 2v68" />
        <circle cx="60" cy="36" r="11" />
        <path d="M2 22h14v28H2M118 22h-14v28h14" />
      </svg>
      <p className="text-[16px] font-semibold text-ink">No requests waiting.</p>
      <p className="mt-1 max-w-xs text-[14.5px] leading-snug text-muted">New ones show up here and in your email.</p>
    </div>
  );
}
