import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Display, Kicker, Spark, TymoLogo } from "@/components/ui";
import { env } from "@/lib/env";
import { getStaffSession } from "@/server/auth";
import { demoSignIn } from "./demo";
import { LoginForm, type LinkError } from "./LoginForm";

export const metadata: Metadata = { title: "Staff sign in" };

const LINK_ERRORS: readonly LinkError[] = ["expired", "used", "invalid"];

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getStaffSession().catch(() => null);
  if (session) redirect("/staff");

  const { error } = await searchParams;
  const linkError = LINK_ERRORS.find((e) => e === error) ?? null;

  return (
    <main className="court-grid flex min-h-dvh flex-1 flex-col px-5 pb-10 pt-6 text-white">
      <Link href="/" aria-label="Tymo home" className="self-start">
        <TymoLogo />
      </Link>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 rise-in">
        <Spark className="mb-5 h-7 w-7" />
        <Kicker className="mb-3 text-white/75">Staff</Kicker>
        <Display as="h1" size="lg" lines={["Sign in", [{ text: "to Tymo", outline: true }]]} />
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/80">
          Approve requests and run the calendar from your phone. Enter your work email and we&apos;ll send you a link.
        </p>
        {env.demoMode ? (
          <section
            aria-labelledby="demo-signin"
            className="mt-8 rounded-card ink-card p-5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)] sm:p-6"
          >
            <h2 id="demo-signin" className="kicker text-white/80">
              Demo facility
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/85">
              This is a demo with a made-up facility, Redbud Soccer Complex. Sign in with one tap to see the staff side.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <form action={demoSignIn}>
                <input type="hidden" name="role" value="owner" />
                <Button type="submit" block>
                  Sign in as the owner
                </Button>
              </form>
              <form action={demoSignIn}>
                <input type="hidden" name="role" value="staff" />
                <Button type="submit" variant="ghostDark" block>
                  Sign in as staff
                </Button>
              </form>
            </div>
          </section>
        ) : null}
        <div className="mt-8 rounded-card bg-white p-5 text-text shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)] sm:p-6">
          <LoginForm linkError={linkError} devHint={!env.isProd} />
        </div>
      </div>
    </main>
  );
}
