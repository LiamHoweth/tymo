import Link from "next/link";
import type { AdminStatusFilter } from "@tymo/company/admin";
import { cn } from "@tymo/shared/cn";
import { STATUS_TABS, requestsHref } from "./status";

/**
 * Status filter as plain links (works without JavaScript). Phones get a
 * 3 by 2 hairline grid so every status is visible; md and up, one
 * underlined row. The current tab is underlined in the accent.
 */
export function StatusTabs({ active, facilitySlug }: { active: AdminStatusFilter; facilitySlug: string | null }) {
  return (
    <nav aria-label="Filter by status">
      <ul className="grid grid-cols-3 gap-px border border-line bg-line md:flex md:gap-0 md:border-x-0 md:border-t-0 md:bg-transparent">
        {STATUS_TABS.map((tab) => {
          const current = tab.value === active;
          return (
            <li key={tab.value}>
              <Link
                href={requestsHref(tab.value, facilitySlug)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center border-b-2 bg-card px-2 text-[14px] md:-mb-px md:justify-start md:bg-transparent md:px-4",
                  current
                    ? "border-accent font-semibold text-text"
                    : "border-transparent font-medium text-muted hover:text-text md:hover:border-line",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
