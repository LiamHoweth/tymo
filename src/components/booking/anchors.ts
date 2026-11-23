/** "Grass fields" -> "grass-fields" (in-page anchors on Choose field). */
export function groupAnchor(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "fields"
  );
}

/** 60..240 in 30-minute steps (spec: chips run from the resource's min to max). */
export function durationOptions(minMinutes: number, maxMinutes: number): number[] {
  const out: number[] = [];
  for (let m = minMinutes; m <= maxMinutes; m += 30) out.push(m);
  return out.length ? out : [minMinutes];
}
