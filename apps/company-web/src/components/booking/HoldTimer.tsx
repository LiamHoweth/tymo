"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@tymo/shared/cn";
import { Clock } from "./icons";

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * "Held for you for 9:41", counting down the checkout hold. The visible
 * clock ticks every second; screen readers hear it only at minute marks
 * ("8 minutes left on your hold") and when it runs out.
 */
export function HoldTimer({ expiresAt, className }: { expiresAt: string; className?: string }) {
  const end = new Date(expiresAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const lastMinute = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const left = end - t;
      const minute = left <= 0 ? 0 : Math.ceil(left / 60000);
      if (lastMinute.current === null) {
        lastMinute.current = minute;
        return;
      }
      if (minute !== lastMinute.current) {
        lastMinute.current = minute;
        setAnnouncement(
          minute === 0 ? "Your hold ran out." : `${minute} ${minute === 1 ? "minute" : "minutes"} left on your hold.`,
        );
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [end]);

  const left = now === null ? null : end - now;
  const out = left !== null && left <= 0;
  const urgent = left !== null && left > 0 && left < 2 * 60000;

  return (
    <div className={cn("flex items-center gap-2 text-[13px]", className)}>
      <Clock className={cn("h-[15px] w-[15px]", out ? "text-[#ffb3c0]" : urgent ? "text-[#ffd28a]" : "text-white/60")} />
      <p className={cn("tabular-nums", out ? "text-[#ffb3c0]" : urgent ? "text-[#ffd28a]" : "text-white/70")}>
        {out ? "Your hold ran out" : left === null ? "Held for you" : `Held for you for ${mmss(left)}`}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
