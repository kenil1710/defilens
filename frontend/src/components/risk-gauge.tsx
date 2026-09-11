import { verdictTone, VERDICT_COPY } from "@/lib/format";
import type { Verdict } from "@/lib/types";

/**
 * The overall score as a gauge.
 *
 * A 270° arc rather than a full ring: the gap at the bottom gives the scale a
 * start and an end, so a reader can see that 72 is most of the way along
 * WITHOUT reading the number. A full ring has no visible zero and reads as a
 * pie chart of nothing.
 *
 * The sweep is drawn with stroke-dasharray and animated by transitioning
 * stroke-dashoffset from the full length — CSS only, no layout thrash, and it
 * degrades to a correctly-filled static arc when motion is reduced.
 */

const THRESHOLDS = { SAFE: 70, MODERATE: 40 } as const;

export function RiskGauge({
  score,
  verdict,
  size = 168,
  animate = true,
  label = true,
}: {
  score: number;
  verdict: Verdict | string;
  size?: number;
  animate?: boolean;
  label?: boolean;
}) {
  const tone = verdictTone(verdict);
  const unknown = verdict === "UNKNOWN";
  const shown = unknown ? 0 : Math.max(0, Math.min(100, Number(score) || 0));

  const stroke = Math.max(8, Math.round(size * 0.072));
  const r = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  // 270° of arc, starting bottom-left, ending bottom-right.
  const SWEEP = 270;
  const circ = 2 * Math.PI * r;
  const arc = (circ * SWEEP) / 360;
  const filled = (arc * shown) / 100;

  const color = unknown
    ? "var(--color-unknown)"
    : shown >= THRESHOLDS.SAFE
      ? "var(--color-safe)"
      : shown >= THRESHOLDS.MODERATE
        ? "var(--color-moderate)"
        : "var(--color-risk)";

  return (
    <figure className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={
            unknown
              ? "Not scored — no TVL history"
              : `Risk score ${shown} out of 100, rated ${VERDICT_COPY[verdict as Verdict]?.label ?? verdict}`
          }
          style={{ transform: "rotate(135deg)" }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--color-wash)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circ}`}
          />
          {/* The three bands, so the scale carries its own legend. */}
          <g opacity={0.5}>
            {[
              { at: THRESHOLDS.MODERATE, c: "var(--color-moderate-rule)" },
              { at: THRESHOLDS.SAFE, c: "var(--color-safe-rule)" },
            ].map(({ at, c }) => (
              <circle
                key={at}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={c}
                strokeWidth={stroke}
                strokeDasharray={`2 ${circ}`}
                strokeDashoffset={-((arc * at) / 100)}
              />
            ))}
          </g>
          {!unknown && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circ}`}
              className={animate ? "gauge-sweep" : undefined}
              style={animate ? ({ ["--sweep" as string]: `${filled}` } as React.CSSProperties) : undefined}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`tnum leading-none font-bold tracking-tight ${unknown ? "text-ink-4" : tone.fg}`}
            style={{ fontSize: Math.round(size * 0.26) }}
          >
            {unknown ? "—" : shown}
          </span>
          <span className="text-ink-4 mt-1 text-[11px] font-medium">
            {unknown ? "no score" : "out of 100"}
          </span>
        </div>
      </div>

      {label && (
        <figcaption className="text-ink-3 mt-1 text-center text-xs">
          {unknown
            ? "DeFi Llama carries no TVL history"
            : VERDICT_COPY[verdict as Verdict]?.label ?? verdict}
        </figcaption>
      )}
    </figure>
  );
}
