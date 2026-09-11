import { DIMENSION_META, DIMENSIONS } from "@/lib/types";
import type { Assessment } from "@/lib/types";
import { scoreTone } from "@/lib/format";

/**
 * The five dimensions as a breakdown, not a chart.
 *
 * Each row carries its WEIGHT, because the weight is the information: a 55 on a
 * 25%-weighted dimension moves the overall score almost twice as far as a 55 on
 * a 15% one, and a bar without its weight invites the reader to average them.
 *
 * Bars are coloured by their OWN score rather than by the protocol's verdict. A
 * protocol that is safe overall can still have one dimension in the red, and
 * painting every bar green would hide precisely what the breakdown is for.
 */
export function DimensionBars({
  assessment,
  compact = false,
  animate = false,
}: {
  assessment: Assessment;
  compact?: boolean;
  animate?: boolean;
}) {
  return (
    <dl className={compact ? "space-y-2" : "space-y-4"}>
      {DIMENSIONS.map((key, i) => {
        const meta = DIMENSION_META[key];
        const score = Number(assessment.scores?.[key] ?? 0);
        const label = assessment.labels?.[i] ?? "";
        const tone = scoreTone(score);
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className={`font-medium ${compact ? "text-xs" : "text-sm"}`}>
                {meta.label}
                <span className="text-ink-4 tnum ml-1.5 font-normal">
                  {meta.weight}%
                </span>
              </dt>
              <dd className={`tnum font-semibold ${tone.fg} ${compact ? "text-xs" : "text-sm"}`}>
                {score}
              </dd>
            </div>
            <div className={`bg-wash mt-1.5 overflow-hidden rounded-full ${compact ? "h-1" : "h-1.5"}`}>
              <div
                className={`h-full rounded-full ${tone.bar} ${animate ? "meter-fill" : ""}`}
                style={{
                  width: `${Math.max(score, 1.5)}%`,
                  animationDelay: animate ? `${140 + i * 70}ms` : undefined,
                }}
              />
            </div>
            {!compact && label && (
              <p className="text-ink-3 mt-1 text-xs">{label}</p>
            )}
          </div>
        );
      })}
    </dl>
  );
}
