"use server";

import { redirect } from "next/navigation";
import { signOut } from "@tymo/platform/auth";

/** Server action for a sign-out button: `<form action={signOutAction}><button>Sign out</button></form>`. */
export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/staff/login");
}
