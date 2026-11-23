"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { StaffRole } from "@tymo/shared/types";
import { cn } from "@tymo/shared/cn";
import { TymoMark } from "@tymo/ui";
import { useStaff } from "./StaffProvider";
import { CalendarIcon, ExitIcon, GearIcon, InboxIcon, OfflineIcon } from "./icons";

type Tab = { href: string; label: string; icon: typeof InboxIcon; match: (path: string) => boolean };

const TABS: Tab[] = [
  {
    href: "/staff",
    label: "Approvals",
    icon: InboxIcon,
    match: (p) => p === "/staff" || p.startsWith("/staff/bookings"),
  },
  {
    href: "/staff/calendar",
    label: "Calendar",
    icon: CalendarIcon,
    match: (p) => p.startsWith("/staff/calendar") || p.startsWith("/staff/blocks"),
  },
  { href: "/staff/settings", label: "Settings", icon: GearIcon, match: (p) => p.startsWith("/staff/settings") },
];

/**
 * Staff chrome: ink top bar with the facility name, a left rail on desktop
 * (lg+) and a bottom tab bar on phones. Approvals carries the waiting count.
 */
export function StaffShell({
  facilityName,
  userName,
  role,
  waitingCount,
  signOutAction,
  children,
}: {
  facilityName: string;
  userName: string;
  role: StaffRole;
  /** Requests waiting, from the server; null if the count couldn't load. */
  waitingCount: number | null;
  signOutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { approvingCount, online } = useStaff();
  const count = waitingCount === null ? null : Math.max(0, waitingCount - approvingCount);

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-40 bg-ink pt-[env(safe-area-inset-top)] text-white">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <Link href="/staff" className="flex min-w-0 items-center gap-2.5 rounded-md">
            <TymoMark className="h-6 w-6 shrink-0" title="Tymo" />
            <span className="h-5 w-px shrink-0 bg-white/20" aria-hidden />
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{facilityName}</span>
          </Link>
          <div className="ml-auto hidden items-center gap-4 lg:flex">
            <span className="text-[13px] text-white/70">
              {userName} · {role === "owner" ? "Owner" : "Staff"}
            </span>
            <SignOutButton action={signOutAction} tone="dark" />
          </div>
        </div>
        {!online ? <OfflineBar /> : null}
      </header>

      <div className="flex flex-1">
        <nav
          aria-label="Staff"
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-6 lg:flex"
        >
          <ul className="flex flex-col gap-1">
            {TABS.map((tab) => {
              const active = tab.match(pathname);
              const Icon = tab.icon;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
                      active ? "bg-paper text-ink" : "text-muted hover:bg-paper/60 hover:text-ink",
                    )}
                  >
                    {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" aria-hidden /> : null}
                    <Icon />
                    <span className="flex-1">{tab.label}</span>
                    {tab.href === "/staff" && count ? <CountBadge count={count} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main id="main" className="min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">
          {children}
        </main>
      </div>

      <nav
        aria-label="Staff"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-3">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            const showCount = tab.href === "/staff" && count;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={showCount ? `${tab.label}, ${count} waiting` : undefined}
                  className={cn(
                    "relative flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11.5px] font-semibold tracking-[0.02em]",
                    active ? "text-ink" : "text-muted",
                  )}
                >
                  {active ? <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-accent" aria-hidden /> : null}
                  <span className="relative">
                    <Icon className="h-6 w-6" />
                    {showCount ? (
                      <span className="absolute -right-3 -top-1.5">
                        <CountBadge count={count} />
                      </span>
                    ) : null}
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function SignOutButton({ action, tone = "light" }: { action: () => Promise<void>; tone?: "light" | "dark" }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[13px] font-semibold",
          tone === "dark" ? "text-white/80 hover:text-white" : "border-[1.5px] border-line bg-white px-5 text-text hover:border-text",
        )}
      >
        <ExitIcon className="h-4 w-4" />
        Sign out
      </button>
    </form>
  );
}

/** Shown under the top bar while the phone is offline. */
function OfflineBar() {
  const [since, setSince] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSince(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div role="status" className="flex items-start gap-2 bg-warn-soft px-4 py-2.5 text-[13.5px] font-medium leading-snug text-[#6b4108] lg:px-6">
      <OfflineIcon className="mt-px h-4 w-4" />
      <p>
        No connection.{since ? ` Showing this page as of ${since}.` : ""} Approve and decline need a connection.
      </p>
    </div>
  );
}
