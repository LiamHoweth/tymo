import { cn } from "@/lib/cn";

type Tone = "ok" | "warn" | "neutral" | "danger" | "brand";

/** Status written out in words (never color alone). */
export function StatusTag({ tone = "neutral", children, className }: { tone?: Tone; children: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em]",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "neutral" && "bg-paper text-muted",
        tone === "danger" && "bg-[#fbeaec] text-danger",
        tone === "brand" && "bg-brand text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}
