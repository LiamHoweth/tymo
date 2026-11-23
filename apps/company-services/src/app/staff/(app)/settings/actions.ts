"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@tymo/platform/auth";
import { inviteStaff, updateResourcePrice } from "@tymo/company/staff";

/** Owner only. Price is whole cents per hour. */
export async function updatePriceAction(resourceId: string, priceCentsPerHour: number): Promise<{ ok: boolean; message: string }> {
  const session = await requireOwner();
  const id = z.string().trim().min(1).max(100).safeParse(resourceId);
  const price = z.number().int().min(100).max(1_000_000).safeParse(priceCentsPerHour);
  if (!id.success) return { ok: false, message: "That field couldn't be found. Refresh and try again." };
  if (!price.success) return { ok: false, message: "Enter a price from $1 to $10,000 an hour." };
  const result = await updateResourcePrice(session, id.data, price.data);
  revalidatePath("/staff", "layout");
  return result;
}

const invite = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  role: z.enum(["owner", "staff"]),
});

/** Owner only: sends the new person a sign-in link. */
export async function inviteStaffAction(input: { name: string; email: string; role: "owner" | "staff" }): Promise<{ ok: boolean; message: string }> {
  const session = await requireOwner();
  const parsed = invite.safeParse({ ...input, email: String(input?.email ?? "").trim().toLowerCase() });
  if (!parsed.success) return { ok: false, message: "Add a name and a valid email." };
  const result = await inviteStaff(session, parsed.data);
  revalidatePath("/staff/settings");
  return result;
}
