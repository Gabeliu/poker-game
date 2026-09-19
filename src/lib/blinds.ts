/**
 * The one definition of what a valid pair of blinds is. Used by the server
 * (which rejects anything else — it never trusts the client) and by every
 * form that edits blinds, so the UI can refuse bad input before it's sent
 * and explain why, and can never disagree with what the server accepts.
 */

export const MAX_SMALL_BLIND = 1_000_000;
export const MAX_BIG_BLIND = 2_000_000;

export interface BlindErrors {
  smallBlind?: string;
  bigBlind?: string;
}

/** Parses what's typed in a blind field: plain digits only. Negatives,
 * decimals, exponents, signs and blanks all come back NaN. */
export function parseBlindText(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
}

function checkOne(value: number, max: number): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a whole number.";
  if (!Number.isInteger(value)) return "Must be a whole number.";
  if (value <= 0) return "Must be greater than zero.";
  if (value > max) return `Must be at most ${max.toLocaleString("en-US")}.`;
  return undefined;
}

/** Validates a small/big blind pair; an empty result means it's valid. */
export function validateBlinds(smallBlind: number, bigBlind: number): BlindErrors {
  const errors: BlindErrors = {
    smallBlind: checkOne(smallBlind, MAX_SMALL_BLIND),
    bigBlind: checkOne(bigBlind, MAX_BIG_BLIND),
  };
  if (!errors.smallBlind && !errors.bigBlind && bigBlind < smallBlind) {
    errors.bigBlind = "Big blind must be at least the small blind.";
  }
  if (!errors.smallBlind) delete errors.smallBlind;
  if (!errors.bigBlind) delete errors.bigBlind;
  return errors;
}

/** The same check straight from the two text fields. */
export function validateBlindText(smallBlind: string, bigBlind: string): BlindErrors {
  return validateBlinds(parseBlindText(smallBlind), parseBlindText(bigBlind));
}

export function hasBlindErrors(errors: BlindErrors): boolean {
  return Boolean(errors.smallBlind || errors.bigBlind);
}
