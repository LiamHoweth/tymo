import type { SubmitErrorCode } from "./copy";
import type { DetailsErrors } from "./validate";

/** Result shapes returned by the booking server actions (src/app/book/[slug]/actions.ts). */

export interface ContinueState {
  error: string | null;
  /** Increments per failed attempt so the UI can tell a new error from an old one. */
  attempt: number;
}

export interface DetailsState {
  fieldErrors: DetailsErrors;
  error: string | null;
  holdExpired: boolean;
  attempt: number;
}

export type SendResult =
  | { ok: true; href: string }
  | { ok: false; error: SubmitErrorCode; message: string; href?: string };

export type CancelResult = { ok: true; message: string } | { ok: false; message: string };
