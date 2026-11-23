"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SlotOption } from "@/lib/types";

export interface PickedSlot {
  slot: SlotOption;
  dateLabel: string; // "Sat, Dec 5"
}

interface TimeSelectionValue {
  picked: PickedSlot | null;
  pick: (picked: PickedSlot | null) => void;
}

const TimeSelectionContext = createContext<TimeSelectionValue | null>(null);

/**
 * Shares the chosen start time between the slot grid (which streams in per
 * date and length) and the sticky summary (which stays put). Changing the
 * date or length (`resetKey`) clears the choice.
 */
export function TimeSelectionProvider({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  const [state, setState] = useState<{ key: string; picked: PickedSlot | null }>({ key: resetKey, picked: null });
  if (state.key !== resetKey) setState({ key: resetKey, picked: null });

  const pick = useCallback((picked: PickedSlot | null) => setState((s) => ({ ...s, picked })), []);
  const value = useMemo(
    () => ({ picked: state.key === resetKey ? state.picked : null, pick }),
    [state, resetKey, pick],
  );
  return <TimeSelectionContext.Provider value={value}>{children}</TimeSelectionContext.Provider>;
}

export function useTimeSelection(): TimeSelectionValue {
  const value = useContext(TimeSelectionContext);
  if (!value) throw new Error("useTimeSelection must be used inside TimeSelectionProvider");
  return value;
}
