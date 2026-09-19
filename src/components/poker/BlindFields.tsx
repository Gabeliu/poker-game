"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateBlindText } from "@/lib/blinds";

interface BlindFieldsProps {
  smallBlind: string;
  bigBlind: string;
  onChange: (next: { smallBlind: string; bigBlind: string }) => void;
  /** Prefix for the input ids (kept distinct where two forms can coexist). */
  idPrefix?: string;
}

/** Only digits get through: a pasted "-50" becomes "50", a pasted "2.5"
 * becomes "25", and the sign/decimal/exponent keys are ignored outright. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 8);
}

const BLOCKED_KEYS = new Set(["-", "+", "e", "E", ".", ","]);

/**
 * The small/big blind pair, with the shared validation shown inline. Negative
 * numbers, decimals and blanks can't be typed, and a big blind smaller than
 * the small blind is flagged — the parent uses the same `validateBlindText`
 * to keep its submit button disabled until the pair is valid.
 */
export function BlindFields({ smallBlind, bigBlind, onChange, idPrefix = "" }: BlindFieldsProps) {
  const errors = validateBlindText(smallBlind, bigBlind);
  const field = (key: "smallBlind" | "bigBlind", label: string, id: string, value: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `${id}-error` : undefined}
        onKeyDown={(e) => {
          if (BLOCKED_KEYS.has(e.key)) e.preventDefault();
        }}
        onChange={(e) => onChange({ smallBlind, bigBlind, [key]: digitsOnly(e.target.value) })}
      />
      {errors[key] && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive" data-testid={`${id}-error`}>
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {field("smallBlind", "Small blind", `${idPrefix}sb`, smallBlind)}
      {field("bigBlind", "Big blind", `${idPrefix}bb`, bigBlind)}
    </div>
  );
}
