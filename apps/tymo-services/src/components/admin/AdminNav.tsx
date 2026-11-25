"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@tymo/shared/cn";

const ITEMS = [
  { href: "/admin", label: "Requests", match: (p: string) => p === "/admin" || p.startsWith("/admin/bookings") },
  { href: "/admin/facilities", label: "Facilities", match: (p: string) => p.startsWith("/admin/facilities") },
];

/** Console sections in the top bar; the current one is underlined in the accent and marked aria-current. */
export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className={className}>
      <ul className="flex h-full">
        {ITEMS.map((item) => {
          const current = item.match(pathname);
          return (
            <li key={item.href} className="flex flex-1 md:flex-none">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center border-b-2 px-4 text-[14px] font-medium",
                  current ? "border-accent text-white" : "border-transparent text-white/70 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
