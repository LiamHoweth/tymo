import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Multi-line companion to TextField: same label, hint and error treatment. */
export function TextAreaField({
  label,
  hint,
  error,
  optional,
  className,
  id,
  rows = 3,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
} & ComponentProps<"textarea">) {
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
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        className={cn(
          "min-h-24 resize-y rounded-xl border-[1.5px] bg-white px-4 py-3 text-[16px] leading-snug text-text outline-none",
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
