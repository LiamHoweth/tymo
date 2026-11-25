import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { adminSignInStatus, getAdminSession } from "@tymo/platform/auth/admin-session";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { signInAction } from "./actions";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function AdminLoginPage() {
  // Sign-in status comes from runtime env, so never prerender this page at build time.
  await connection();
  const status = adminSignInStatus();
  if (status === "ready" && (await getAdminSession())) redirect("/admin");

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-paper">
      <AdminTopBar />
      <main className="flex flex-1 justify-center px-4 py-10 md:py-20">
        <div className="w-full max-w-sm self-start border border-line bg-card">
          <div className="border-b border-line px-5 py-4">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-text">Sign in</h1>
            <p className="mt-1 text-[14px] leading-snug text-muted">
              For the Tymo team. A read-only view of requests at every facility.
            </p>
          </div>
          <div className="px-5 py-5">
            {status === "off" ? (
              <div role="status" className="border border-line border-l-2 border-l-warn bg-warn-soft px-4 py-3 text-[14px] leading-snug text-text">
                Admin sign-in is off on this server. Set <code className="font-semibold">TYMO_ADMIN_USER</code>,{" "}
                <code className="font-semibold">TYMO_ADMIN_PASSWORD</code> and{" "}
                <code className="font-semibold">SESSION_SECRET</code> on Tymo services.
              </div>
            ) : (
              <AdminLoginForm action={signInAction} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
