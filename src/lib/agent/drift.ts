import type { DriftInsight } from "@/src/lib/types";

const MIN_PRIOR_DEALS = 3;
const Z_THRESHOLD = 1.5;

function mean(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdDev(xs: number[], mu: number) {
  return Math.sqrt(xs.reduce((s, x) => s + (x - mu) ** 2, 0) / xs.length);
}

export function detectDrift(
  region: string,
  newAmountUsd: number,
  priorAmountsUsd: number[],
): DriftInsight | null {
  if (priorAmountsUsd.length < MIN_PRIOR_DEALS) return null;

  const prevAvg = mean(priorAmountsUsd);
  const sd = stdDev(priorAmountsUsd, prevAvg);
  if (sd === 0) return null;

  const z = (newAmountUsd - prevAvg) / sd;
  if (Math.abs(z) <= Z_THRESHOLD) return null;

  const newAvg = mean([...priorAmountsUsd, newAmountUsd]);
  const pctChange = ((newAvg - prevAvg) / prevAvg) * 100;
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const dir = pctChange >= 0 ? "+" : "";
  const message =
    `Heads up — this ${usd(newAmountUsd)} ${region} deal is ${z.toFixed(1)}σ ` +
    `from ${region}'s average (${usd(prevAvg)}); average deal size moved ` +
    `${dir}${pctChange.toFixed(0)}% → ${usd(newAvg)}.`;

  return { region, amount: newAmountUsd, z, prevAvg, newAvg, pctChange, message };
}
