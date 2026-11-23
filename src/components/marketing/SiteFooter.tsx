import Link from "next/link";
import { TymoLogo } from "@/components/ui";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <TymoLogo />
          <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-white/60">
            Online booking and payments for sports facilities.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
          <Link href="/book/redbud" className="inline-flex min-h-11 items-center text-white/75 hover:text-white">
            See a booking page
          </Link>
          <Link href="/staff" className="inline-flex min-h-11 items-center text-white/75 hover:text-white">
            Staff sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
