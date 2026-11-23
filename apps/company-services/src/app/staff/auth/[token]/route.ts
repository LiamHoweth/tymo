import { redirect } from "next/navigation";
import { consumeMagicLink } from "@tymo/platform/auth";

/** The emailed sign-in link: one use, 15 minutes. Sets the session cookie and opens the staff app. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  let reason: "invalid" | "expired" | "used" | null = null;
  try {
    const result = await consumeMagicLink(token);
    if (!result.ok) reason = result.reason;
  } catch (err) {
    console.error("[auth] could not consume a magic link", err);
    reason = "invalid";
  }
  redirect(reason ? `/staff/login?error=${reason}` : "/staff");
}
