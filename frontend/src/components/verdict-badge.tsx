import { verdictTone, VERDICT_COPY } from "@/lib/format";
import type { Verdict } from "@/lib/types";

/**
 * The grade. Always the same shape, always in the same place, always the same
 * colour for the same verdict — the way a rating agency prints one, so that it
 * is recognisable at a glance across every surface of the site.
 */
export function VerdictBadge({
  verdict,
  size = "md",
}: {
  verdict: Verdict | string;
  size?: "sm" | "md" | "lg";
}) {
  const tone = verdictTone(verdict);
  const copy = VERDICT_COPY[verdict as Verdict] ?? VERDICT_COPY.UNKNOWN;
  const dims = {
    sm: "text-[11px] px-2 py-0.5 gap-1.5",
    md: "text-xs px-2.5 py-1 gap-2",
    lg: "text-sm px-3 py-1.5 gap-2",
  }[size];
  const dot = { sm: "size-1.5", md: "size-1.5", lg: "size-2" }[size];
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${tone.bg} ${tone.ring} ${tone.fg} ${dims}`}
      title={copy.means}
    >
      <span className={`rounded-full ${tone.bar} ${dot}`} aria-hidden />
      {copy.label}
    </span>
  );
}

/** The score, set large enough to be the thing you read first. */
export function ScoreMark({
  score,
  verdict,
  size = "lg",
}: {
  score: number;
  verdict: Verdict | string;
  size?: "sm" | "lg";
}) {
  const tone = verdictTone(verdict);
  const unknown = verdict === "UNKNOWN";
  if (size === "sm") {
    return (
      <span className={`tnum font-semibold ${unknown ? "text-ink-4" : tone.fg}`}>
        {unknown ? "—" : score}
        {!unknown && <span className="text-ink-4 font-normal">/100</span>}
      </span>
    );
  }
  return (
    <div className="flex items-baseline gap-1">
      <span className={`tnum text-5xl font-bold tracking-tight ${unknown ? "text-ink-4" : tone.fg}`}>
        {unknown ? "—" : score}
      </span>
      <span className="text-ink-4 text-lg font-medium">/100</span>
    </div>
  );
}
