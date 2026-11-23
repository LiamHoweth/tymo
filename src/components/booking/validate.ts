/** Your details validation, shared by the form (instant) and the server action (authoritative). */

export interface DetailsValues {
  name: string;
  phone: string;
  email: string;
  team: string;
  waiverAccepted: boolean;
}

export type DetailsErrors = Partial<Record<keyof DetailsValues, string>>;

export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

export function validateDetails(v: DetailsValues): DetailsErrors {
  const errors: DetailsErrors = {};
  if (!v.name.trim()) errors.name = "Enter your name.";
  if (phoneDigits(v.phone).length !== 10) errors.phone = "Enter a 10-digit phone number.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) errors.email = "Enter an email address, like name@example.com.";
  if (!v.waiverAccepted) errors.waiverAccepted = "Check the box to agree to the waiver.";
  return errors;
}

/** Fake (test mode) card: 16 digits. */
export function cardDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 16);
}

/** "4242424242424242" -> "4242 4242 4242 4242" */
export function groupCard(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Brand guess for a test card number, for the review line only. */
export function fakeCardLabel(digits: string): string {
  const brand = /^4/.test(digits)
    ? "Visa"
    : /^(5[1-5]|2[2-7])/.test(digits)
      ? "Mastercard"
      : /^3[47]/.test(digits)
        ? "American Express"
        : /^6/.test(digits)
          ? "Discover"
          : "Card";
  return `${brand} ending ${digits.slice(-4)}`;
}
