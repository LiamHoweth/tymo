"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { BlockInput, BlockPreview, CreateBlockResult } from "@/lib/types";
import { requireStaff } from "@/server/auth";
import { createBlock, previewBlock, removeBlock } from "@/server/booking/staff";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const blockInput = z.object({
  kind: z.enum(["one_time", "weekly", "closure"]),
  label: z.string().trim().min(1).max(80),
  resourceId: z.string().trim().min(1).max(100).nullable(),
  date: ymd.optional(),
  endDate: ymd.optional(),
  startLocal: hhmm.optional(),
  endLocal: hhmm.optional(),
  allDay: z.boolean().optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  startDate: ymd.optional(),
  untilDate: ymd.optional(),
  publicReason: z.string().trim().max(120).optional(),
});

function parse(input: BlockInput): BlockInput | null {
  const r = blockInput.safeParse(input);
  if (!r.success) return null;
  // Only closures may cover the whole venue.
  if (r.data.resourceId === null && r.data.kind !== "closure") return null;
  return r.data;
}

export async function previewBlockAction(input: BlockInput): Promise<BlockPreview | null> {
  const session = await requireStaff();
  const parsed = parse(input);
  if (!parsed) return null;
  return previewBlock(session, parsed);
}

export async function createBlockAction(input: BlockInput, skipConflicts: boolean): Promise<CreateBlockResult> {
  const session = await requireStaff();
  const parsed = parse(input);
  if (!parsed) return { ok: false, error: "invalid", message: "Check the field, dates and times." };
  const result = await createBlock(session, parsed, { skipConflicts: skipConflicts === true });
  if (result.ok) revalidatePath("/staff", "layout");
  return result;
}

const scope = z.enum(["this", "following", "all"]);

export async function removeBlockAction(
  blockId: string,
  removeScope: "this" | "following" | "all",
  occurrenceDate?: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await requireStaff();
  const id = z.string().trim().min(1).max(100).safeParse(blockId);
  const s = scope.safeParse(removeScope);
  const d = occurrenceDate === undefined ? { success: true as const, data: undefined } : ymd.safeParse(occurrenceDate);
  if (!id.success || !s.success || !d.success) return { ok: false, message: "That block couldn't be found. Refresh and try again." };
  if (s.data !== "all" && !d.data) return { ok: false, message: "Pick a date to remove." };
  const result = await removeBlock(session, id.data, s.data, d.data);
  revalidatePath("/staff", "layout");
  return result;
}
