import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Display, Kicker, Spark, TymoLogo } from "@/components/ui";
import { env } from "@/lib/env";
import { getStaffSession } from "@/server/auth";
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
        <div className="mt-8 rounded-card bg-white p-5 text-text shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)] sm:p-6">
          <LoginForm linkError={linkError} devHint={!env.isProd} />
        </div>
      </div>
    </main>
  );
}
