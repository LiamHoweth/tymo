/** "$120.00" */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** "$30" when whole dollars, else "$30.50" */
export function formatCentsShort(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : formatCents(cents);
}

/** "$30/hr" */
export function formatRate(centsPerHour: number): string {
  return `${formatCentsShort(centsPerHour)}/hr`;
}

/** 90 -> "1½ hr", 60 -> "1 hr", 150 -> "2½ hr", 45 -> "45 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} hr`;
  if (rest === 30) return `${hours}½ hr`;
  return `${hours} hr ${rest} min`;
}

/** "(580) 555-0142" from any 10-digit US number; otherwise unchanged. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

/** "visa", "4242" -> "Visa ending 4242" */
export function formatCard(brand: string | null, last4: string | null): string | null {
  if (!last4) return null;
  const names: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
  };
  return `${(brand && names[brand]) || "Card"} ending ${last4}`;
}
