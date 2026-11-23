import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@tymo/shared/cn";

/** Native select styled like TextField (native picker on phones). */
export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
} & ComponentProps<"select">) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-[13px] font-semibold text-text">
        {label}
      </label>
      <div className="relative">
        <select
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hint && hintId, error && errorId) || undefined}
          className={cn(
            "h-12 w-full appearance-none rounded-xl border-[1.5px] bg-white pl-4 pr-10 text-[16px] text-text outline-none",
            "transition-[border-color,box-shadow]",
            "focus:border-brand focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_14%,transparent)]",
            error ? "border-danger" : "border-line",
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
        </svg>
      </div>
      {hint ? (
        <div id={hintId} className="text-[13px] text-muted">
          {hint}
        </div>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
