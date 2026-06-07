const FX_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  JPY: 0.0067,
};

export const SUPPORTED_CURRENCIES = Object.keys(FX_TO_USD);

export function toUsd(amount: number, currency: string): number {
  const rate = FX_TO_USD[currency.toUpperCase()];
  if (rate === undefined) throw new Error(`Unsupported currency: ${currency}`);
  return Math.round(amount * rate * 100) / 100;
}
