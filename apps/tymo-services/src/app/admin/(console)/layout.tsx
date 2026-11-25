import { connection } from "next/server";
import { requireAdmin } from "@tymo/platform/auth/admin-session";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { signOutAction } from "./actions";

/**
 * Signed-in admin console. Layouts don't re-render on client navigation,
 * so every page also calls requireAdmin() before it reads any data.
 */
export default async function AdminConsoleLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  const session = await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-paper">
      <AdminTopBar user={session.user} signOutAction={signOutAction} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
