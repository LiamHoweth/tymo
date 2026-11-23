"use server";

import { requestMagicLink } from "@tymo/platform/auth";
import { normalizeEmail } from "@tymo/platform/auth/tokens";

export interface LoginState {
  status: "idle" | "sent" | "error";
  email?: string;
  message?: string;
}

/** Same answer whether or not the address belongs to anyone (no account enumeration). */
export async function requestSignInLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("email") ?? "").slice(0, 320);
  const email = normalizeEmail(raw);
  if (!email) return { status: "error", email: raw, message: "Enter your email address, like name@example.com." };
  await requestMagicLink(email);
  return { status: "sent", email };
}
