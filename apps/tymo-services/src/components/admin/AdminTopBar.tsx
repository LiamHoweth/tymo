import Link from "next/link";
import { TymoLogo } from "@tymo/ui";
import { AdminNav } from "./AdminNav";

/**
 * Solid ink bar: logo + "Admin". Signed in, it adds the section nav (its
 * own row on phones), the username and Sign out.
 */
export function AdminTopBar({ user, signOutAction }: { user?: string; signOutAction?: () => Promise<void> }) {
  return (
    <header className="sticky top-0 z-30 bg-ink text-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-stretch px-4 md:h-14 md:flex-nowrap md:px-6">
        <Link href="/admin" className="flex h-14 shrink-0 items-center gap-3 md:h-auto">
          <TymoLogo />
          <span aria-hidden className="h-5 w-px bg-white/25" />
          <span className="text-[15px] font-semibold">Admin</span>
        </Link>
        {user ? (
          <>
            <AdminNav className="order-last -mx-4 w-[calc(100%+2rem)] border-t border-white/15 md:order-none md:mx-0 md:ml-8 md:w-auto md:border-t-0" />
            <div className="ml-auto flex min-w-0 items-center gap-3 pl-3">
              <span className="min-w-0 truncate text-[13px] text-white/75">
                <span className="sr-only">Signed in as </span>
                {user}
              </span>
              {signOutAction ? (
                <form action={signOutAction} className="shrink-0">
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-none border border-white/30 px-3 text-[13px] font-semibold text-white hover:border-white hover:bg-white/10"
                  >
                    Sign out
                  </button>
                </form>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
