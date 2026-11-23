import { signOut } from "@/server/auth";

/** POST /staff/auth/sign-out: end the session and go to the sign-in page (303 so the browser follows with GET). */
export async function POST(): Promise<Response> {
  await signOut();
  return new Response(null, { status: 303, headers: { Location: "/staff/login" } });
}
