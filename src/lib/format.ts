export function formatChips(amount: number): string {
  return Math.round(amount).toLocaleString("en-US");
}

export function formatSignedChips(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${formatChips(Math.abs(rounded))}`;
}
