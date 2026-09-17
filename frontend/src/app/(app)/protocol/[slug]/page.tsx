import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessment, getHistory, getCategoryRisk, consumerCheck, consumerConfig } from "@/lib/oracle";
import { VerdictBadge } from "@/components/verdict-badge";
import { RiskGauge } from "@/components/risk-gauge";
import { DimensionBars } from "@/components/dimension-bars";
import { TvlChart } from "@/components/tvl-chart";
import { VerifyPanel } from "@/components/verify-panel";
import { usd, usdExact, age, pct, when, ago, shortHash, verdictTone, VERDICT_COPY } from "@/lib/format";
import { DIMENSION_META, DIMENSIONS } from "@/lib/types";
import { llamaUrl, addressUrl, ORACLE_ADDRESS, CONSUMER_ADDRESS } from "@/lib/genlayer";

export const revalidate = 120;

/*
 * Rendered ON DEMAND and then revalidated, not pre-rendered.
 *
 * `generateStaticParams` would build a page per rated protocol across seven
 * worker processes, and GenLayer Studio meters thirty reads a minute — the
 * build bursts straight through it and every worker starts retrying. It would
 * also be wrong on its own terms: a protocol rated after the deploy would have
 * no page until the next one.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = await getAssessment(slug);
  if (!a) return { title: `${slug} — DeFiLens` };
  return {
    title: `${a.name}: ${VERDICT_COPY[a.verdict].label} ${a.overall_score}/100 — DeFiLens`,
    description: `${a.name} is rated ${a.overall_score}/100 by DeFiLens across five dimensions, from DeFi Llama data agreed by five independent validators.`,
  };
}

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await getAssessment(slug);
  if (!a) notFound();

  const [history, catRisk, check, conCfg] = await Promise.all([
    getHistory(slug, 6),
    getCategoryRisk(a.category),
    consumerCheck(slug),
    consumerConfig(),
  ]);
  const tone = verdictTone(a.verdict);
  const copy = VERDICT_COPY[a.verdict];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav className="text-ink-3 mb-6 text-sm">
        <Link href="/protocols" className="hover:text-accent">Ratings</Link>
        <span className="text-ink-4 mx-2">/</span>
        <span className="text-ink-2">{a.name}</span>
      </nav>

      {/* the grade, first */}
      <header className={`card-raised ${tone.tab} px-6 py-6 sm:px-8`}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{a.name}</h1>
              <span className="bg-wash border-rule text-ink-2 rounded border px-2 py-0.5 text-xs font-medium">
                {a.category || "uncategorised"}
              </span>
              {a.kind === "parent" && (
                <span className="border-accent-rule bg-accent-wash text-accent rounded border px-2 py-0.5 text-xs font-medium">
                  protocol family
                </span>
              )}
            </div>
            <p className="text-ink-3 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-mono">{a.slug}</span>
              <a href={llamaUrl(a.slug)} target="_blank" rel="noreferrer"
                className="hover:text-accent underline underline-offset-2">
                on DeFi Llama
              </a>
            </p>
            <p className="text-ink-2 mt-4 max-w-[58ch] leading-relaxed">{copy.means}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2.5">
            <RiskGauge score={a.overall_score} verdict={a.verdict} size={160} label={false} />
            <VerdictBadge verdict={a.verdict} size="lg" />
            <p className="text-ink-4 text-xs">rated {ago(a.analyzed_at)}</p>
          </div>
        </div>

        <dl className="border-rule mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-4">
          <Figure label="Total value locked" value={usd(a.tvl_usd)} note={usdExact(a.tvl_usd)} />
          <Figure
            label="Share of all-time peak"
            value={a.has_tvl_history ? `${a.tvl_pct_of_peak}%` : "—"}
            note={a.has_tvl_history ? `peak ${usd(a.peak_tvl_usd)}` : "no history"}
          />
          <Figure
            label="TVL over 30 days"
            value={a.has_tvl_history ? pct(a.tvl_change_30d_pct, true) : "—"}
            tone={a.tvl_change_30d_pct > 0 ? "text-safe" : a.tvl_change_30d_pct < -15 ? "text-risk" : undefined}
          />
          <Figure label="Age" value={age(a.age_days)} note={a.first_tvl_day ? `since ${when(a.first_tvl_day)}` : undefined} />
        </dl>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="space-y-8">
          <section className="card px-6 py-6">
            <h2 className="text-lg font-semibold">How the score was built</h2>
            <p className="text-ink-3 mt-1.5 max-w-[58ch] text-sm leading-relaxed">
              Each dimension is bucketed 0–7 from public data, then weighted. The
              weight is why two dimensions at the same score do not move the total
              by the same amount.
            </p>
            <div className="mt-6">
              <DimensionBars assessment={a} animate />
            </div>

            <div className="border-rule mt-6 border-t pt-5">
              <h3 className="text-sm font-semibold">What each dimension asks</h3>
              <dl className="mt-3 space-y-2.5">
                {DIMENSIONS.map((key) => (
                  <div key={key} className="text-sm">
                    <dt className="font-medium">{DIMENSION_META[key].label}</dt>
                    <dd className="text-ink-3 max-w-[62ch] leading-relaxed">
                      {DIMENSION_META[key].asks}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {a.audit_status && (
              <div className="border-rule mt-6 border-t pt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">Audit evidence</h3>
                  <span className="text-ink-2 text-sm">
                    {a.audit_status.toLowerCase()}
                    {a.audit_bonus > 0 && (
                      <span className="text-ink-3"> · +{a.audit_bonus} points</span>
                    )}
                  </span>
                </div>
                <p className="text-ink-3 mt-2 max-w-[62ch] text-sm leading-relaxed">
                  This is the only place a language model is used, and it is worth
                  at most four points of a hundred. The deterministic code narrows
                  the answer to two adjacent options first; the model picks between
                  them, and an unreadable answer falls to the less generous one.
                </p>
                {a.audit_note && (
                  <blockquote className="border-rule text-ink-3 mt-2.5 border-l-2 pl-3 text-xs leading-relaxed italic">
                    {a.audit_note}
                  </blockquote>
                )}
              </div>
            )}
          </section>

          <section className="card px-6 py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">Total value locked</h2>
              <span className="text-ink-3 text-sm">
                {a.has_tvl_history
                  ? `now ${usd(a.tvl_usd)} · peak ${usd(a.peak_tvl_usd)}`
                  : "no history published"}
              </span>
            </div>
            <div className="mt-5">
              <TvlChart slug={a.slug} />
            </div>
          </section>

          <section className="card px-6 py-6">
            <h2 className="text-lg font-semibold">Verify this rating</h2>
            <p className="text-ink-3 mt-1.5 max-w-[62ch] text-sm leading-relaxed">
              Nothing here was taken on trust from whoever submitted it. The
              evidence below is the exact integer vector five validators agreed
              on, and every stored number is a pure function of it.
            </p>
            <div className="mt-5">
              <VerifyPanel assessmentId={a.assessment_id} />
            </div>
            <div className="border-rule mt-6 space-y-3 border-t pt-5">
              <Field label="Content hash" value={a.content_hash} mono />
              <Field label="Evidence vector" value={a.evidence} mono wrap />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <Field label="Assessment" value={`#${a.assessment_id}`} />
                <Field label="Revision" value={`${a.seq}`} />
                <Field label="Rubric" value={`v${a.rubric_version}`} />
                <Field label="Fee paid" value={`${a.fee_paid_wei} wei`} />
              </div>
              <Field
                label="Submitted by"
                value={shortHash(a.analyst, 12)}
                mono
                href={addressUrl(a.analyst)}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card px-5 py-5">
            <h2 className="text-sm font-semibold">
              Deployed on {a.chain_count} {a.chain_count === 1 ? "chain" : "chains"}
            </h2>
            {a.chains.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {a.chains.map((c) => (
                  <li key={c} className="border-rule bg-wash text-ink-2 rounded border px-2 py-0.5 text-xs">
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3 mt-2 text-sm">No chain list published.</p>
            )}
            {a.chain_count === 1 && (
              <p className="text-ink-3 mt-3 text-xs leading-relaxed">
                A single-chain protocol is one outage away from all of its
                deposits, which is why chain diversity carries 20%.
              </p>
            )}
          </section>

          {a.children.length > 0 && (
            <section className="card px-5 py-5">
              <h2 className="text-sm font-semibold">Markets in this family</h2>
              <p className="text-ink-3 mt-1.5 text-xs leading-relaxed">
                DeFi Llama models this as a parent. The category was taken from
                the children by TVL weight, and the chain list is their union.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {a.children.map((c) => (
                  <li key={c}>
                    <Link href={`/protocol/${c}`}
                      className="border-rule-2 hover:border-accent hover:text-accent rounded border bg-white px-2 py-0.5 font-mono text-xs">
                      {c}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {catRisk && (
            <section className="card px-5 py-5">
              <h2 className="text-sm font-semibold">Category risk</h2>
              <p className="text-ink-2 mt-2 text-sm">
                <span className="font-medium">{catRisk.category}</span> is rated{" "}
                <span className="tnum font-semibold">{catRisk.ordinal}</span>/7 —{" "}
                {catRisk.label}.
              </p>
              <p className="text-ink-3 mt-2 text-xs leading-relaxed">
                {catRisk.mapped
                  ? `Worth ${catRisk.weight_pct}% of the overall score. Categories are ranked by how much of a depositor's money is exposed to one contract, one oracle, or one validator set.`
                  : `This category is not in the rubric's table, so it scored the default of ${catRisk.default_when_unmapped}/7 rather than being guessed at.`}
              </p>
            </section>
          )}

          {check && conCfg && (
            <section className="card px-5 py-5">
              <h2 className="text-sm font-semibold">What a contract would do</h2>
              <p className="text-ink-3 mt-1.5 text-xs leading-relaxed">
                Live from DeFiConsumer, an admission gate deployed against this
                oracle with a floor of {conCfg.min_score}/100. It reads and
                decides; it holds no funds.
              </p>
              <div
                className={`mt-3 rounded-lg border px-3 py-2.5 ${
                  check.allowed ? "border-safe-rule bg-safe-wash" : "border-risk-rule bg-risk-wash"
                }`}
              >
                <p className="text-sm font-semibold">
                  {check.allowed ? "Would be admitted" : "Would be refused"}
                </p>
                <p className="text-ink-2 mt-1 text-xs leading-relaxed">
                  {/* The contract answers "allowed" for the happy path, which
                      says nothing a reader cannot already see. Spell out WHY it
                      passed instead; the refusal reason is worth printing as-is. */}
                  {check.allowed
                    ? `Rated ${check.score}/100, above the ${check.min_score} floor, and the rating is ${Math.round(check.assessment_age_s / 60)} minutes old against a ${Math.round(check.max_assessment_age_s / 3600)}-hour limit.`
                    : check.reason}
                </p>
              </div>
              <a
                href={addressUrl(CONSUMER_ADDRESS)}
                target="_blank"
                rel="noreferrer"
                className="text-ink-3 hover:text-accent mt-2.5 inline-block font-mono text-xs underline underline-offset-2"
              >
                {shortHash(CONSUMER_ADDRESS, 8)}
              </a>
            </section>
          )}

          {history.length > 1 && (
            <section className="card overflow-hidden">
              <h2 className="border-rule border-b px-5 py-3 text-sm font-semibold">
                Rating history
              </h2>
              <ul>
                {history.map((h) => (
                  <li key={h.assessment_id}
                    className="border-rule flex items-center justify-between gap-3 border-b px-5 py-2.5 text-sm last:border-b-0">
                    <span className="text-ink-3 text-xs">{when(h.analyzed_at)}</span>
                    <span className="flex items-center gap-2">
                      <VerdictBadge verdict={h.verdict} size="sm" />
                      <span className="tnum w-6 text-right font-semibold">
                        {h.verdict === "UNKNOWN" ? "—" : h.overall_score}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-ink-3 border-rule border-t px-5 py-2.5 text-xs leading-relaxed">
                Re-rating appends; it never edits. The oracle keeps the last six
                per protocol.
              </p>
            </section>
          )}

          <section className="card px-5 py-5">
            <h2 className="text-sm font-semibold">Read it from a contract</h2>
            <pre className="text-ink-2 mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed">
{`IDeFiLens(oracle)
  .view()
  .get_risk_summary("${a.slug}")`}
            </pre>
            <a
              href={addressUrl(ORACLE_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className="text-ink-3 hover:text-accent mt-2 inline-block font-mono text-xs underline underline-offset-2"
            >
              {shortHash(ORACLE_ADDRESS, 8)}
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Figure({
  label, value, note, tone,
}: {
  label: string; value: string; note?: string; tone?: string;
}) {
  return (
    <div>
      <dd className={`tnum text-xl font-bold tracking-tight ${tone ?? ""}`}>{value}</dd>
      <dt className="text-ink-3 mt-0.5 text-xs">{label}</dt>
      {note && <p className="text-ink-4 tnum mt-0.5 text-xs">{note}</p>}
    </div>
  );
}

function Field({
  label, value, mono, wrap, href,
}: {
  label: string; value: string; mono?: boolean; wrap?: boolean; href?: string;
}) {
  const body = (
    <span className={`text-ink block text-xs ${mono ? "font-mono" : ""} ${wrap ? "break-all" : "truncate"}`}>
      {value}
    </span>
  );
  return (
    <div className="min-w-0">
      <span className="text-ink-3 block text-xs">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="hover:text-accent block min-w-0">
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  );
}
