import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Labeled text input with helper text and an inline error. Error text sits
 * under the field and is announced (aria-describedby + role=alert).
 */
export function TextField({
  label,
  hint,
  error,
  optional,
  className,
  id,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
} & ComponentProps<"input">) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-[13px] font-semibold text-text">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">(optional)</span> : null}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        className={cn(
          "h-12 rounded-xl border-[1.5px] bg-white px-4 text-[16px] text-text outline-none",
          "transition-[border-color,box-shadow] placeholder:text-muted/70",
          "focus:border-brand focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_14%,transparent)]",
          error ? "border-danger" : "border-line",
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Checkbox with a label that can hold links (e.g. "Read the waiver"). */
export function CheckboxField({
  label,
  error,
  className,
  id,
  ...props
}: { label: ReactNode; error?: string | null } & Omit<ComponentProps<"input">, "type">) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer rounded-md border-line accent-[var(--brand)]"
          {...props}
        />
        <label htmlFor={inputId} className="text-[15px] leading-snug text-text">
          {label}
        </label>
      </div>
      {error ? (
        <p role="alert" className="pl-9 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
