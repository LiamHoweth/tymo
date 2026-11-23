"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon, CopyIcon } from "./icons";

/**
 * Shows a booking link with "Copy link". Relative links are shown and
 * copied with the current origin.
 */
export function CopyLinkButton({ link, tone = "light", className }: { link: string; tone?: "light" | "dark"; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    const absolute = link.startsWith("/") ? `${window.location.origin}${link}` : link;
    try {
      await navigator.clipboard.writeText(absolute);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  const shown = link.replace(/^https?:\/\//, "");

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <code
        className={cn(
          "min-w-0 flex-1 truncate rounded-xl px-3.5 py-3 font-sans text-[14.5px] font-medium",
          tone === "dark" ? "bg-white/10 text-white" : "border border-line bg-paper text-ink",
        )}
      >
        {shown}
      </code>
      <button
        type="button"
        onClick={copy}
        className={cn(
          "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[14.5px] font-semibold transition-colors",
          tone === "dark" ? "bg-white text-ink hover:bg-paper" : "bg-ink text-white hover:bg-ink-2",
        )}
      >
        {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
        <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
      </button>
      {failed ? (
        <p role="alert" className={cn("text-[13px]", tone === "dark" ? "text-white/80" : "text-danger")}>
          Couldn&apos;t copy. Press and hold the link to copy it.
        </p>
      ) : null}
    </div>
  );
}
