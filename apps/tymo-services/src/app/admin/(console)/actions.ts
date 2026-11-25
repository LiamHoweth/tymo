"use server";

import { redirect } from "next/navigation";
import { signOutAdmin } from "@tymo/platform/auth/admin-session";

export async function signOutAction(): Promise<void> {
  await signOutAdmin();
  redirect("/admin/login");
}
