import type { Verdict } from "./types";

/** Money the way a tearsheet writes it: three significant figures and a unit,
 *  because that is the precision the contract actually agreed on. */
export function usd(n: number | string | undefined | null): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "$0";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function usdExact(n: number | string | undefined | null): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "$0";
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function age(days: number | undefined | null): string {
  const d = Number(days ?? 0);
  if (d <= 0) return "no history";
  if (d < 60) return `${d} days`;
  if (d < 730) return `${Math.floor(d / 30)} months`;
  const years = d / 365;
  return `${years.toFixed(1)} years`;
}

export function pct(n: number | undefined | null, withSign = false): string {
  const v = Number(n ?? 0);
  const sign = withSign && v > 0 ? "+" : "";
  return `${sign}${v}%`;
}

export function when(epoch: number | undefined | null): string {
  const t = Number(epoch ?? 0);
  if (!t) return "—";
  return new Date(t * 1000).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function ago(epoch: number | undefined | null): string {
  const t = Number(epoch ?? 0);
  if (!t) return "—";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - t);
  if (secs < 90) return "just now";
  if (secs < 5400) return `${Math.round(secs / 60)} min ago`;
  if (secs < 172800) return `${Math.round(secs / 3600)} h ago`;
  return `${Math.round(secs / 86400)} d ago`;
}

export function shortHash(h: string | undefined | null, n = 10): string {
  const s = String(h ?? "");
  if (s.length <= n * 2 + 1) return s;
  return `${s.slice(0, n)}…${s.slice(-6)}`;
}

export const VERDICT_COPY: Record<Verdict, { label: string; means: string }> = {
  SAFE: {
    label: "Safe",
    means: "Scored 70 or above. Healthy deposit base, deployed widely, and old enough to have been tested.",
  },
  MODERATE: {
    label: "Moderate",
    means: "Scored 40 to 69. Nothing disqualifying, but at least one dimension is weak enough to read before depositing.",
  },
  HIGH_RISK: {
    label: "High risk",
    means: "Scored below 40. Several dimensions are weak at once. Read the breakdown before you deposit anything.",
  },
  UNKNOWN: {
    label: "Unknown",
    means: "DeFi Llama carries no TVL history for this protocol, so it cannot be scored. That is not a low score — it is no score.",
  },
};

export function verdictTone(v: Verdict | string) {
  switch (v) {
    case "SAFE":
      return { fg: "text-safe", bg: "bg-safe-wash", ring: "border-safe-rule", bar: "bg-safe", tab: "tab-safe" };
    case "MODERATE":
      return { fg: "text-moderate", bg: "bg-moderate-wash", ring: "border-moderate-rule", bar: "bg-moderate", tab: "tab-moderate" };
    case "HIGH_RISK":
      return { fg: "text-risk", bg: "bg-risk-wash", ring: "border-risk-rule", bar: "bg-risk", tab: "tab-risk" };
    default:
      return { fg: "text-unknown", bg: "bg-unknown-wash", ring: "border-unknown-rule", bar: "bg-unknown", tab: "tab-unknown" };
  }
}

/** A dimension bar's colour follows the SCORE, not the verdict: a protocol that
 *  is safe overall can still have one dimension in the red, and colouring every
 *  bar green would hide exactly the thing the breakdown exists to show. */
export function scoreTone(score: number) {
  if (score >= 70) return { bar: "bg-safe", fg: "text-safe" };
  if (score >= 40) return { bar: "bg-moderate", fg: "text-moderate" };
  return { bar: "bg-risk", fg: "text-risk" };
}
