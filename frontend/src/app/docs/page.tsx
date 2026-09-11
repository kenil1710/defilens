import type { Metadata } from "next";
import Link from "next/link";
import { getConfig, getStats } from "@/lib/oracle";
import { DIMENSION_META, DIMENSIONS } from "@/lib/types";
import { ORACLE_ADDRESS, CONSUMER_ADDRESS, addressUrl, EXPLORER, CHAIN } from "@/lib/genlayer";

export const metadata: Metadata = {
  title: "Methodology — DeFiLens",
  description:
    "How a DeFiLens rating is computed, what consensus binds, and how to read the oracle from a contract.",
};

export const revalidate = 60;

const LADDER_COPY: Record<string, { unit: string; rows: string[] }> = {
  tvl_health: {
    unit: "current TVL as a percentage of the all-time peak",
    rows: ["under 3%", "3–9%", "10–17%", "18–29%", "30–44%", "45–59%", "60–79%", "80% or more"],
  },
  chain_diversity: {
    unit: "number of distinct chains",
    rows: ["1", "2", "3", "4", "5", "6–7", "8–9", "10 or more"],
  },
  maturity: {
    unit: "days since the first TVL datapoint",
    rows: ["under 30", "30–89", "90–179", "180–364", "1–1.5 years", "1.5–2 years", "2–3 years", "over 3 years"],
  },
  category_risk: {
    unit: "how much is exposed to one contract, oracle or validator set",
    rows: ["Ponzi, lottery", "bridges", "derivatives, leveraged farming", "synthetics, options, NFT lending", "yield, restaking, farms", "CDP, stablecoin issuers, RWA", "lending, DEXes, payments", "liquid staking, oracles, wallets"],
  },
  momentum: {
    unit: "TVL change over the last 30 days",
    rows: ["under −50%", "−50 to −31%", "−30 to −16%", "−15 to −6%", "−5 to +4%", "+5 to +19%", "+20 to +49%", "+50% or more"],
  },
};

export default async function DocsPage() {
  const [config, stats] = await Promise.all([getConfig(), getStats()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_180px] lg:gap-12">
        <article className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Methodology</h1>
          <p className="text-ink-2 mt-3 max-w-[62ch] text-lg leading-relaxed">
            DeFiLens turns a protocol into sixteen integers, scores those integers
            with fixed arithmetic, and stores the result only if five independent
            validators produced the same sixteen integers.
          </p>

          <Section id="data" title="Where the data comes from">
            <p>
              Two documents, both public, both fetched by every validator
              independently:{" "}
              <Code>api.llama.fi/protocols</Code> for a protocol&apos;s category,
              chain list and listing date, and{" "}
              <Code>api.llama.fi/protocol/&#123;slug&#125;</Code> for its full TVL
              history.
            </p>
            <p>
              The host is a constant in the contract, never a parameter. A
              submitter who could name the host could point five validators at a
              server they control and manufacture any verdict they liked.
            </p>
            <p>
              Not every name is a slug. <Code>aave</Code> is not a row in the
              protocol list at all — DeFi Llama models it as a parent whose
              children carry the data — so a family resolves by aggregating its
              children: category by their TVL weight, chains as their union, and
              the earliest listing date. A name that matches nothing comes back
              with the nearest names that do.
            </p>
          </Section>

          <Section id="dimensions" title="The five dimensions">
            <p>
              Each is bucketed 0–7 and weighted. A bucket is an integer function
              of public data — there is no judgement anywhere in this table.
            </p>
            <div className="not-prose mt-5 space-y-6">
              {DIMENSIONS.map((key) => {
                const meta = DIMENSION_META[key];
                const ladder = LADDER_COPY[key];
                return (
                  <div key={key} className="card px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold">{meta.label}</h3>
                      <span className="tnum text-ink-3 text-sm">{meta.weight}% of the score</span>
                    </div>
                    <p className="text-ink-2 mt-1.5 max-w-[62ch] text-sm leading-relaxed">{meta.asks}</p>
                    <p className="text-ink-3 mt-3 text-xs">Bucketed on {ladder.unit}:</p>
                    <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      {ladder.rows.map((r, i) => (
                        <li key={r} className="flex gap-1.5">
                          <span className="text-ink-4 tnum">{i}</span>
                          <span className="text-ink-2">{r}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section id="scoring" title="From buckets to a verdict">
            <p>
              The five buckets are weighted and scaled to 0–100, then quantised to
              the nearest five. Precision beyond that would be false: the inputs
              are live figures from a cached API, and a score of 73 rather than 75
              would imply a resolution the data does not have.
            </p>
            <Pre>{`weighted = health×25 + chains×20 + maturity×20
         + category×20 + momentum×15      # 0..700
base     = weighted × 100 ÷ 700              # 0..100
overall  = quantise_to_5(base + audit_bonus) # 0..100`}</Pre>
            <p>
              Thresholds: <strong>{config?.thresholds.SAFE ?? 70} and above is
              safe</strong>, {config?.thresholds.MODERATE ?? 40} to{" "}
              {(config?.thresholds.SAFE ?? 70) - 1} is moderate, below{" "}
              {config?.thresholds.MODERATE ?? 40} is high risk.
            </p>
            <p>
              <strong>Unknown is not a low score.</strong> A protocol DeFi Llama
              tracks but publishes no TVL history for cannot be scored at all.
              Calling that high risk would defame it for a gap in somebody
              else&apos;s data; calling it safe would tell a depositor that an
              absence of evidence is evidence of safety. It is excluded from both
              the safest and the riskiest rankings.
            </p>
          </Section>

          <Section id="model" title="Where the language model is, and is not">
            <p>
              One call, in one place: reading whether a protocol&apos;s published
              audit evidence is substantive. It is worth at most{" "}
              <strong>{config?.audit_bonus_max ?? 4} points out of a hundred</strong>.
            </p>
            <p>
              It never picks freely. The deterministic code computes a bracket
              first, from DeFi Llama&apos;s own audit count, whether audit links
              exist, and whether the audit note says anything. Where the bracket
              has one member the model is not called at all; where it has two, the
              choice is between adjacent options. An answer that cannot be read
              falls to the less generous one — so a broken model can only ever
              cost a protocol points, never award them.
            </p>
            <p>
              Everything else — all {DIMENSIONS.length} dimensions, the whole
              score, the verdict — is arithmetic.
            </p>
          </Section>

          <Section id="consensus" title="What consensus binds">
            <p>
              Every stored value. Not the verdict, not the important fields —
              every one. A field the validators did not compare is a field the
              leader could forge, and a forged TVL on a risk oracle is the whole
              attack.
            </p>
            <p>
              Live figures cannot be compared as-is: two validators fetching
              seconds apart read different numbers whenever the API&apos;s
              half-hour cache refreshes mid-round. So TVL is rounded to three
              significant figures and percentages to the nearest five{" "}
              <em>before</em> they reach the axis, and the comparison itself
              demands exact equality. The tolerance is in the quantisation, never
              in the comparison — two accepted answers to one question that differ
              are two answers, and then which one is the rating?
            </p>
            <p>
              After consensus, every stored number is recomputed from the agreed
              vector. The leader&apos;s own arithmetic is discarded, not trusted.
              That is what makes{" "}
              <Code>verify_assessment</Code> meaningful rather than ceremonial:
              the evidence stored beside a rating is the exact vector the
              validators agreed on, and anyone can replay the arithmetic.
            </p>
          </Section>

          <Section id="integrate" title="Reading the oracle from a contract">
            <p>
              Every rating is a view call, so a contract can ask before it moves
              money. Three methods matter.
            </p>
            <Pre>{`@gl.contract.interface
class IDeFiLens:
    class View:
        def get_risk_summary(self, protocol_slug: str) -> typing.Any: ...
    class Write:
        pass

ORACLE = Address("${ORACLE_ADDRESS}")

# 1. get_risk_summary — NEVER raises. Branch on the answer.
s = IDeFiLens(ORACLE).view().get_risk_summary("aave-v3")
#   {"found": true, "verdict": "SAFE", "safe": true,
#    "overall_score": 85, "high_risk": false,
#    "assessment_id": 7, "content_hash": "…",
#    "age_of_assessment_s": 412, …}

# 2. is_safe — one bool. False for unrated, unknown and unparseable
#    alike, because "nobody has looked" must not read as "it is fine".
ok = IDeFiLens(ORACLE).view().is_safe("aave-v3")

# 3. require_safe — reverts on HIGH_RISK, on UNKNOWN, and on
#    not-yet-rated. Use it as a guard, not as a question.
IDeFiLens(ORACLE).view().require_safe("aave-v3")`}</Pre>
            <p>
              <strong>Prefer <Code>get_risk_summary</Code> on a payable path.</strong>{" "}
              A guard that reverts keeps the caller&apos;s deposit with no record
              to refund it from. The deployed{" "}
              <Link href={`/protocol`} className="text-accent hover:text-accent-dark">
                DeFiConsumer
              </Link>{" "}
              example does exactly this: it reads the summary, refuses high-risk,
              unrated and stale ratings alike, credits the deposit back, and pins
              the assessment id and content hash that admitted every deposit it
              did accept.
            </p>
            <p>
              <strong>Decide your own staleness rule.</strong> The oracle reports
              what it measured and when; how old is too old belongs to the
              integrator. <Code>age_of_assessment_s</Code> is in every summary.
            </p>
          </Section>

          <Section id="limits" title="What this does not tell you">
            <p>
              A rating is a reading of DeFi Llama&apos;s public data on a rubric.
              It is not an audit, not a guarantee, and not financial advice.
            </p>
            <ul>
              <li>
                It cannot see a bug. Maturity and audit evidence are proxies for
                code quality, not measurements of it.
              </li>
              <li>
                It cannot see governance. A protocol with a single multisig key
                and a perfect score is still a protocol with a single multisig key.
              </li>
              <li>
                It inherits DeFi Llama&apos;s judgements — its categories, its TVL
                methodology, its coverage. Where that data is wrong, the rating is
                wrong in the same direction.
              </li>
              <li>
                It is a point in time. Re-rate before you rely on it; the oracle
                keeps the last {config?.history_per_protocol ?? 6} per protocol so
                you can see whether a score is moving.
              </li>
            </ul>
          </Section>

          <Section id="deployment" title="Deployment">
            <dl className="not-prose grid gap-3 text-sm">
              <Deployed label="DeFiLens oracle" address={ORACLE_ADDRESS} />
              <Deployed label="DeFiConsumer example" address={CONSUMER_ADDRESS} />
              <div className="flex flex-wrap items-baseline gap-x-3">
                <dt className="text-ink-3 w-40 shrink-0">Network</dt>
                <dd>
                  GenLayer Studio Dev · chain{" "}
                  <span className="tnum">{CHAIN.id}</span> ·{" "}
                  <a href={EXPLORER} target="_blank" rel="noreferrer"
                    className="text-accent hover:text-accent-dark">
                    explorer
                  </a>
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <dt className="text-ink-3 w-40 shrink-0">Rubric</dt>
                <dd className="tnum">v{config?.rubric_version ?? "1.0.0"}</dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <dt className="text-ink-3 w-40 shrink-0">Fee</dt>
                <dd>
                  {Number(config?.fee_wei ?? 0) === 0
                    ? "free"
                    : `${config?.fee_wei} wei`}{" "}
                  <span className="text-ink-3">
                    · rate limited to one request per wallet per{" "}
                    {config?.rate_limit_seconds ?? 300}s, one rating per protocol
                    per {Math.round((config?.protocol_cooldown_seconds ?? 900) / 60)} min
                  </span>
                </dd>
              </div>
              {stats && (
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <dt className="text-ink-3 w-40 shrink-0">Stored</dt>
                  <dd className="tnum">
                    {stats.total_analyzed} assessments across{" "}
                    {stats.protocols_tracked} protocols
                  </dd>
                </div>
              )}
            </dl>
          </Section>
        </article>

        <nav className="sticky top-20 hidden self-start lg:block">
          <p className="text-ink-3 text-xs font-medium">On this page</p>
          <ul className="mt-2.5 space-y-1.5 text-sm">
            {[
              ["data", "Data source"],
              ["dimensions", "The five dimensions"],
              ["scoring", "Scoring"],
              ["model", "The model"],
              ["consensus", "Consensus"],
              ["integrate", "Integration"],
              ["limits", "Limits"],
              ["deployment", "Deployment"],
            ].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-ink-2 hover:text-accent block">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function Section({
  id, title, children,
}: {
  id: string; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-rule mt-12 scroll-mt-20 border-t pt-8">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="text-ink-2 mt-3 max-w-[66ch] space-y-3 leading-relaxed [&_li]:leading-relaxed [&_strong]:text-ink [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-wash border-rule text-ink rounded border px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="border-rule not-prose overflow-x-auto rounded-xl border bg-[#1c1917] p-4 font-mono text-[12.5px] leading-relaxed text-[#e7e5e4]">
      {children}
    </pre>
  );
}

function Deployed({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <dt className="text-ink-3 w-40 shrink-0">{label}</dt>
      <dd className="min-w-0">
        <a href={addressUrl(address)} target="_blank" rel="noreferrer"
          className="text-accent hover:text-accent-dark font-mono text-xs break-all">
          {address}
        </a>
      </dd>
    </div>
  );
}
