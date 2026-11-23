"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@tymo/shared/cn";

/**
 * Bottom sheet on phones, centered dialog on wider screens. Built on the
 * native <dialog> element (focus trap, Escape to close, backdrop).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className={cn(
        "m-0 mt-auto w-full max-w-none rounded-t-[24px] bg-white p-0 text-text backdrop:bg-ink/60",
        "sm:m-auto sm:max-w-lg sm:rounded-[24px]",
        className,
      )}
    >
      <div className="max-h-[85dvh] overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <h2 className="mb-3 text-lg font-bold leading-snug">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
