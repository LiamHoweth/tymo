"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { StaffActionResult } from "@tymo/shared/types";
import { formatCents } from "@tymo/shared/format";
import { cn } from "@tymo/shared/cn";
import { TymoMark } from "@tymo/ui";
import { AlertIcon, CloseIcon } from "./icons";
import { firstName, possessive } from "./format";

/**
 * App-wide runtime for the staff app, mounted once in the (app) layout so it
 * survives tab changes:
 *  - toasts (one stack, above the tab bar on phones)
 *  - approve-with-undo: the approval is sent only after 5 seconds; Undo or
 *    leaving the page (pagehide) cancels it and nothing is charged
 *  - online/offline state
 */

export type ToastTone = "info" | "ok" | "warn" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
  /** Draws a draining bar for this many ms (the undo window). */
  countdownMs?: number;
}

export interface ApprovalRequest {
  bookingId: string;
  customerName: string;
  priceCents: number;
}

interface StaffRuntime {
  toast: (message: string, tone?: ToastTone) => void;
  approve: (req: ApprovalRequest) => void;
  /** True while an approval waits out its undo window or is being sent. */
  isApproving: (bookingId: string) => boolean;
  /** True once an approval went through (keep the card hidden until the list refreshes). */
  isHidden: (bookingId: string) => boolean;
  /** Approvals not yet confirmed by the server; subtracted from the tab badge. */
  approvingCount: number;
  online: boolean;
}

const Ctx = createContext<StaffRuntime | null>(null);

export function useStaff(): StaffRuntime {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStaff must be used inside <StaffProvider>");
  return ctx;
}

const UNDO_MS = 5000;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Fallback copy when the engine sends no message (it normally does). */
function failureCopy(result: Extract<StaffActionResult, { ok: false }>, first: string): string {
  if (result.message) return result.message;
  switch (result.error) {
    case "already_handled":
      return result.handledBy ? `${result.handledBy} already handled this request.` : "Someone already handled this request.";
    case "capture_failed":
      return `Couldn't charge ${possessive(first)} card. The time is open again, and ${first} was asked to book with another card.`;
    case "not_found":
      return "That request is gone. It may have expired or been cancelled.";
    case "forbidden":
      return "Only the owner can do that.";
    default:
      return `${possessive(first)} request wasn't approved. Try again.`;
  }
}

export function StaffProvider({
  approveAction,
  children,
}: {
  approveAction: (bookingId: string) => Promise<StaffActionResult>;
  children: ReactNode;
}) {
  const online = useOnline();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [approving, setApproving] = useState<Record<string, true>>({});
  const [hidden, setHidden] = useState<Record<string, true>>({});
  const nextId = useRef(1);
  const pending = useRef(new Map<string, { timer: number; toastId: number; first: string }>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">, autoCloseMs?: number) => {
      const id = nextId.current++;
      // Keep the stack short: the newest three.
      setToasts((list) => [...list.slice(-2), { ...toast, id }]);
      if (autoCloseMs) window.setTimeout(() => dismiss(id), autoCloseMs);
      return id;
    },
    [dismiss],
  );

  const toast = useCallback(
    (message: string, tone: ToastTone = "ok") => {
      push({ message, tone }, tone === "error" || tone === "warn" ? 9000 : 5000);
    },
    [push],
  );

  const release = useCallback((bookingId: string) => {
    setApproving((map) => {
      const next = { ...map };
      delete next[bookingId];
      return next;
    });
  }, []);

  const undo = useCallback(
    (bookingId: string) => {
      const entry = pending.current.get(bookingId);
      if (!entry) return;
      window.clearTimeout(entry.timer);
      pending.current.delete(bookingId);
      dismiss(entry.toastId);
      release(bookingId);
      push({ tone: "info", message: `Undone. ${possessive(entry.first)} card wasn't charged.` }, 3500);
    },
    [dismiss, push, release],
  );

  const send = useCallback(
    async (req: ApprovalRequest, first: string) => {
      try {
        const result = await approveAction(req.bookingId);
        if (result.ok) {
          setHidden((map) => ({ ...map, [req.bookingId]: true }));
          push(
            { tone: "ok", message: result.message || `Approved. ${possessive(first)} card was charged ${formatCents(req.priceCents)}.` },
            5000,
          );
        } else {
          // These outcomes take the request off the queue for good.
          if (result.error === "already_handled" || result.error === "capture_failed" || result.error === "not_found") {
            setHidden((map) => ({ ...map, [req.bookingId]: true }));
          }
          push({ tone: result.error === "already_handled" ? "warn" : "error", message: failureCopy(result, first) }, 10000);
        }
      } catch {
        push(
          { tone: "error", message: `No connection. ${possessive(first)} request wasn't approved, and nothing was charged. Try again.` },
          10000,
        );
      } finally {
        release(req.bookingId);
      }
    },
    [approveAction, push, release],
  );

  const approve = useCallback(
    (req: ApprovalRequest) => {
      if (pending.current.has(req.bookingId)) return;
      const first = firstName(req.customerName);
      setApproving((map) => ({ ...map, [req.bookingId]: true }));
      const toastId = push({
        tone: "info",
        message: `Approved. Charging ${possessive(first)} card in 5 seconds.`,
        action: { label: "Undo", onClick: () => undo(req.bookingId) },
        countdownMs: UNDO_MS,
      });
      const timer = window.setTimeout(() => {
        pending.current.delete(req.bookingId);
        dismiss(toastId);
        void send(req, first);
      }, UNDO_MS);
      pending.current.set(req.bookingId, { timer, toastId, first });
    },
    [dismiss, push, send, undo],
  );

  // Leaving the page inside the undo window cancels the approval. pagehide
  // also covers the back-forward cache, where timers would otherwise resume.
  useEffect(() => {
    const cancelAll = () => {
      for (const [bookingId, entry] of pending.current) {
        window.clearTimeout(entry.timer);
        dismiss(entry.toastId);
        release(bookingId);
      }
      pending.current.clear();
    };
    window.addEventListener("pagehide", cancelAll);
    return () => window.removeEventListener("pagehide", cancelAll);
  }, [dismiss, release]);

  const value = useMemo<StaffRuntime>(
    () => ({
      toast,
      approve,
      isApproving: (id) => Boolean(approving[id]),
      isHidden: (id) => Boolean(hidden[id]),
      approvingCount: Object.keys(approving).length,
      online,
    }),
    [toast, approve, approving, hidden, online],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-3",
        "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[26rem] lg:items-stretch lg:px-0",
      )}
    >
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "rise-in pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl bg-ink text-white",
        "shadow-[0_18px_40px_-18px_rgb(0_9_36/0.7)] ring-1",
        toast.tone === "error" ? "ring-[#ff8a96]/60" : toast.tone === "warn" ? "ring-[#f5c26b]/60" : "ring-white/10",
      )}
    >
      <div className="flex items-center gap-3 py-2.5 pl-4 pr-2">
        {toast.tone === "ok" ? (
          <TymoMark className="h-5 w-5 shrink-0 text-[#7ee2a8]" />
        ) : toast.tone === "error" || toast.tone === "warn" ? (
          <AlertIcon className={cn("h-5 w-5", toast.tone === "error" ? "text-[#ff8a96]" : "text-[#f5c26b]")} />
        ) : null}
        <p className="min-w-0 flex-1 py-1.5 text-[14.5px] leading-snug">{toast.message}</p>
        {toast.action ? (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="min-h-11 shrink-0 rounded-full bg-white px-5 text-[14px] font-bold text-ink active:scale-[0.97]"
          >
            {toast.action.label}
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/60 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {toast.countdownMs ? <Countdown ms={toast.countdownMs} /> : null}
    </div>
  );
}

/** Draining bar for the undo window. */
function Countdown({ ms }: { ms: number }) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
      <div
        className="h-full bg-accent ease-linear"
        style={{ width: started ? "0%" : "100%", transitionProperty: "width", transitionDuration: `${ms}ms` }}
      />
    </div>
  );
}
