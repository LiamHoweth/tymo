"use client";

import { useState, useTransition } from "react";
import { Button, TextField } from "@/components/ui";
import { SelectField } from "@/components/ui/SelectField";
import { useStaff } from "../StaffProvider";

type Result = { ok: boolean; message: string };

/** Owner: invite someone by email; they get a sign-in link. */
export function InviteForm({
  inviteAction,
}: {
  inviteAction: (input: { name: string; email: string; role: "owner" | "staff" }) => Promise<Result>;
}) {
  const { toast, online } = useStaff();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "staff">("staff");
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Add their name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter an email like name@example.com.";
    setErrors(next);
    if (next.name || next.email) return;
    startTransition(async () => {
      try {
        const r = await inviteAction({ name: name.trim(), email: email.trim(), role });
        if (r.ok) {
          toast(r.message || `Invite sent to ${email.trim()}.`, "ok");
          setName("");
          setEmail("");
          setRole("staff");
        } else setErrors({ form: r.message });
      } catch {
        setErrors({ form: "No connection. The invite wasn't sent." });
      }
    });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
      </div>
      <SelectField
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value === "owner" ? "owner" : "staff")}
        hint={
          role === "owner"
            ? "Owners can also refund, change prices and payouts, and invite people."
            : "Staff approve and decline, add blocks and notes, and cancel with a full refund."
        }
      >
        <option value="staff">Staff</option>
        <option value="owner">Owner</option>
      </SelectField>
      {errors.form ? (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {errors.form}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="ink" disabled={pending || !online}>
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
