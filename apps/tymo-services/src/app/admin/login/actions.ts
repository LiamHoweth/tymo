"use server";

import { redirect } from "next/navigation";
import { signInAdmin } from "@tymo/platform/auth/admin-session";
import type { AdminSignInState } from "@/components/admin/AdminLoginForm";

export async function signInAction(_prev: AdminSignInState, formData: FormData): Promise<AdminSignInState> {
  const user = String(formData.get("username") ?? "").trim().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 500);
  if (!user || !password) return { error: "missing", user };

  const result = await signInAdmin(user, password);
  if (!result.ok) return { error: result.reason, user };

  // Outside any try/catch: redirect() works by throwing.
  redirect("/admin");
}
