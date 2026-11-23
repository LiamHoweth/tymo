import type { Tx } from "@tymo/db/client";
import { auditLog } from "@tymo/db/schema";

export type ActorType = "staff" | "customer" | "system";

export interface AuditEntry {
  tenantId: string;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  data?: Record<string, unknown> | null;
  at?: Date;
}

/** Append one audit_log row (the table is insert/select only for tymo_app). */
export async function writeAudit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: e.tenantId,
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId ?? null,
    reason: e.reason ?? null,
    data: e.data ?? null,
    createdAt: e.at ?? new Date(),
  });
}
