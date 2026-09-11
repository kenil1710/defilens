import { RiskGauge } from "./risk-gauge";
import { DIMENSION_META, DIMENSIONS } from "@/lib/types";
import { scoreTone } from "@/lib/format";
import type { Assessment } from "@/lib/types";

/**
 * The hero's right-hand side: one real rating, drawn as the instrument.
 *
 * The gauge is the product's whole claim in one object — a protocol reduced to
 * a number, with the evidence that made it sitting underneath. A generic
 * illustration of a shield would say "security" without saying what is
 * measured; this says what is measured and shows the measurement.
 */
export function HeroVisual({ a }: { a: Assessment }) {
  return (
    <div className="card-raised relative overflow-hidden px-6 py-7">
      {/* a faint grid, so the card reads as an instrument panel rather than a
          floating box — drawn in CSS, no asset, no request */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #f5f5f4 1px, transparent 1px), linear-gradient(to bottom, #f5f5f4 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse at 50% 0%, black 35%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, black 35%, transparent 75%)",
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink-3 text-[11px] font-medium tracking-wide uppercase">
              Live rating
            </p>
            <p className="mt-0.5 truncate text-lg font-semibold">{a.name}</p>
          </div>
          <span className="border-rule bg-wash text-ink-2 shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium">
            {a.category}
          </span>
        </div>

        <div className="mt-4 flex justify-center">
          <RiskGauge score={a.overall_score} verdict={a.verdict} size={176} />
        </div>

        <dl className="border-rule mt-5 space-y-2.5 border-t pt-4">
          {DIMENSIONS.map((key, i) => {
            const v = Number(a.scores?.[key] ?? 0);
            const tone = scoreTone(v);
            return (
              <div key={key} className="flex items-center gap-3">
                <dt className="text-ink-2 w-28 shrink-0 text-xs">
                  {DIMENSION_META[key].label}
                </dt>
                <dd className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="bg-wash h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
                    <span
                      className={`meter-fill block h-full rounded-full ${tone.bar}`}
                      style={{
                        width: `${Math.max(v, 2)}%`,
                        animationDelay: `${300 + i * 80}ms`,
                      }}
                    />
                  </span>
                  <span className={`tnum w-6 shrink-0 text-right text-xs font-semibold ${tone.fg}`}>
                    {v}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>

        <p className="text-ink-4 border-rule mt-4 border-t pt-3 text-[11px] leading-relaxed">
          Read live from the oracle. Five validators agreed on every figure above
          before it was written.
        </p>
      </div>
    </div>
  );
}
