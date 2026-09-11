import Link from "next/link";
import { getStats, getSafest, getRiskiest, getAssessment } from "@/lib/oracle";
import { HeroVisual } from "@/components/hero-visual";
import { VerdictBadge } from "@/components/verdict-badge";
import { RiskGauge } from "@/components/risk-gauge";
import { DIMENSION_META, DIMENSIONS } from "@/lib/types";
import type { Assessment, Dimension } from "@/lib/types";
import { usd, scoreTone } from "@/lib/format";

export const revalidate = 120;

export default async function Home() {
  const [stats, safest, riskiest] = await Promise.all([
    getStats(),
    getSafest(6),
    getRiskiest(6),
  ]);

  /*
   * The hero and the worked example come from the SAME two reads.
   *
   * The example needs a protocol at each end of the scale, and the hero needs
   * the strongest one — fetching those separately would spend four of the
   * thirty reads a minute Studio allows to learn what two already answered.
   */
  const bestSlug = safest[0]?.slug;
  const worstSlug = riskiest.find((p) => p.slug !== bestSlug)?.slug;
  const [best, worst] = await Promise.all([
    bestSlug ? getAssessment(bestSlug) : null,
    worstSlug ? getAssessment(worstSlug) : null,
  ]);

  return (
    <>
      <Hero hero={best} />
      <Why />
      <HowItWorks />
      {best && worst && <Example best={best} worst={worst} />}
      <SocialProof stats={stats} />
      <FinalCta />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── hero */

function Hero({ hero }: { hero: Assessment | null }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-20">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-16">
        <div className="rise">
          <p className="text-ink-3 text-xs font-semibold tracking-wide uppercase">
            On-chain risk ratings
          </p>
          <h1 className="mt-3 text-[2.75rem] leading-[1.04] font-bold tracking-tight sm:text-6xl">
            Know before
            <br />
            you deposit.
          </h1>
          <p className="text-ink-2 mt-6 max-w-[54ch] text-lg leading-relaxed">
            DeFiLens scores any DeFi protocol out of 100 from public data — how
            much of its peak deposit base it still holds, how widely it is
            deployed, how long it has survived, and which way money is moving.
          </p>
          <p className="text-ink-3 mt-4 max-w-[54ch] leading-relaxed">
            Five independent validators each fetch the data themselves and must
            agree on every number before a rating is written on chain. The
            evidence is stored with it, so anyone can recompute the score — and
            any contract can read the verdict before it moves money.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/analyze"
              className="bg-accent hover:bg-accent-dark rounded-lg px-5 py-3 text-sm font-semibold text-white transition-colors"
            >
              Analyze a protocol
            </Link>
            <Link
              href="/protocols"
              className="border-rule-2 hover:bg-wash rounded-lg border bg-white px-5 py-3 text-sm font-semibold transition-colors"
            >
              Browse scored protocols
            </Link>
          </div>
        </div>

        <div className="rise" style={{ animationDelay: "120ms" }}>
          {hero ? <HeroVisual a={hero} /> : <HeroFallback />}
        </div>
      </div>
    </section>
  );
}

/** Shown when no live rating is available — because nothing is rated yet, or
 *  because the node is rate-limiting this caller. It must still look like the
 *  product rather than like an error, and it must NOT assert which of those two
 *  it is, since from here they are indistinguishable. */
function HeroFallback() {
  return (
    <div className="card-raised px-6 py-10 text-center">
      <RiskGauge score={0} verdict="UNKNOWN" size={168} label={false} animate={false} />
      <p className="mt-4 text-sm font-semibold">No live rating to show</p>
      <p className="text-ink-3 mx-auto mt-2 max-w-[32ch] text-sm leading-relaxed">
        The oracle is deployed and answering. Put a protocol through it and its
        rating appears here.
      </p>
      <Link
        href="/analyze"
        className="bg-accent hover:bg-accent-dark mt-5 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white"
      >
        Analyze a protocol
      </Link>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── why defilens */

const WHY = [
  {
    title: "Trustless",
    body: "No analyst, no committee, and no site operator decides what a protocol scores. Five validators fetch the data independently and have to agree on every figure — the vector, the identity, the hash. One node that disagrees writes nothing at all.",
    icon: Shield,
  },
  {
    title: "Multi-chain",
    body: "Coverage is every protocol DeFi Llama tracks, across every chain it tracks them on — thousands of them, from single-chain farms to deployments spanning forty networks. Breadth of deployment is itself one of the five things scored.",
    icon: Globe,
  },
  {
    title: "Composable",
    body: "A rating is a view call, not a webpage. A vault deciding where to route deposits can ask the oracle before it moves money and branch on the answer, rather than trusting a number a front end showed a human last week.",
    icon: Plug,
  },
];

function Why() {
  return (
    <section className="border-rule border-y bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why DeFiLens?</h2>
        <p className="text-ink-3 mt-2.5 max-w-[62ch] leading-relaxed">
          Risk scores are easy to publish and hard to trust. These are the three
          things that make this one different from a spreadsheet with a website
          in front of it.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WHY.map(({ title, body, icon: Icon }) => (
            <article key={title} className="card flex flex-col px-5 py-5">
              <span className="border-accent-rule bg-accent-wash flex size-10 items-center justify-center rounded-lg border">
                <Icon />
              </span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="text-ink-2 mt-2 text-sm leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── how it works */

const STEPS = [
  {
    title: "Name a protocol",
    body: "Type any protocol DeFi Llama tracks. Families resolve to their markets; a name that does not exist comes back with the nearest ones that do.",
    icon: Cursor,
  },
  {
    title: "Validators fetch it",
    body: "Five of them, independently, straight from api.llama.fi — no shared cache and no middleman that could feed them all the same wrong answer.",
    icon: Nodes,
  },
  {
    title: "They must agree",
    body: "Each reduces the data to sixteen integers and scores them. Figures are bucketed first, so honest nodes match exactly. Disagreement writes nothing.",
    icon: Check,
  },
  {
    title: "The rating is stored",
    body: "Every stored number is recomputed from the agreed vector, never taken from the leader — with the evidence beside it, so it can be replayed later.",
    icon: Ledger,
  },
];

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
      <p className="text-ink-3 mt-2.5 max-w-[62ch] leading-relaxed">
        Four steps, about thirty seconds end to end.
      </p>

      <ol className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ title, body, icon: Icon }, i) => (
          <li key={title} className="relative">
            <div className="flex items-center gap-3">
              <span className="border-rule-2 flex size-11 shrink-0 items-center justify-center rounded-xl border bg-white">
                <Icon />
              </span>
              <span className="text-ink-4 tnum text-xs font-semibold">
                Step {i + 1}
              </span>
            </div>
            <h3 className="mt-3.5 font-semibold">{title}</h3>
            <p className="text-ink-2 mt-1.5 max-w-[40ch] text-sm leading-relaxed">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────── example */

function Example({ best, worst }: { best: Assessment; worst: Assessment }) {
  return (
    <section className="border-rule border-y bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          The same rubric, two different answers
        </h2>
        <p className="text-ink-3 mt-2.5 max-w-[62ch] leading-relaxed">
          Both of these went through identical arithmetic on data pulled the same
          way. An oracle where everything scores well is an oracle that measures
          nothing — so here is the top of the book next to the bottom of it.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <ExampleCard a={best} note="Strongest rating currently on the oracle" />
          <ExampleCard a={worst} note="Weakest rating currently on the oracle" />
        </div>

        <p className="text-ink-3 mt-6 max-w-[68ch] text-sm leading-relaxed">
          The gap is not a matter of opinion. It is{" "}
          <span className="text-ink font-medium">{gapSentence(best, worst)}</span>{" "}
          — each one an integer function of figures both protocols publish.
        </p>
      </div>
    </section>
  );
}

function ExampleCard({ a, note }: { a: Assessment; note: string }) {
  return (
    <article className="card flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
      <div className="shrink-0 self-center">
        <RiskGauge score={a.overall_score} verdict={a.verdict} size={132} label={false} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-ink-4 text-[11px] font-medium tracking-wide uppercase">{note}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{a.name}</h3>
          <VerdictBadge verdict={a.verdict} size="sm" />
        </div>
        <p className="text-ink-3 tnum mt-1 text-xs">
          {a.category} · {usd(a.tvl_usd)} TVL · {a.chain_count}{" "}
          {a.chain_count === 1 ? "chain" : "chains"}
        </p>

        <dl className="mt-4 space-y-1.5">
          {DIMENSIONS.map((key) => {
            const v = Number(a.scores?.[key] ?? 0);
            const tone = scoreTone(v);
            return (
              <div key={key} className="flex items-center gap-2.5">
                <dt className="text-ink-2 w-24 shrink-0 text-[11px]">
                  {DIMENSION_META[key].label}
                </dt>
                <dd className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="bg-wash h-1 min-w-0 flex-1 overflow-hidden rounded-full">
                    <span
                      className={`block h-full rounded-full ${tone.bar}`}
                      style={{ width: `${Math.max(v, 2)}%` }}
                    />
                  </span>
                  <span className={`tnum w-5 shrink-0 text-right text-[11px] font-semibold ${tone.fg}`}>
                    {v}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>

        <Link
          href={`/protocol/${a.slug}`}
          className="text-accent hover:text-accent-dark mt-4 inline-block text-sm font-semibold"
        >
          See the full breakdown →
        </Link>
      </div>
    </article>
  );
}

/** Name the two dimensions that actually separate them, rather than asserting
 *  that a gap exists. Computed, so it cannot drift from the data above it. */
function gapSentence(a: Assessment, b: Assessment): string {
  const gaps = DIMENSIONS.map((d) => ({
    d,
    gap: Number(a.scores?.[d] ?? 0) - Number(b.scores?.[d] ?? 0),
  }))
    .filter((g) => g.gap !== 0)
    .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))
    .slice(0, 2);
  if (gaps.length === 0) return "an identical breakdown across all five dimensions";
  const phrase = (g: { d: Dimension; gap: number }) =>
    `${Math.abs(g.gap)} points of ${DIMENSION_META[g.d].lower}`;
  return gaps.map(phrase).join(" and ");
}

/* ──────────────────────────────────────────────────────── social proof */

function SocialProof({ stats }: { stats: Awaited<ReturnType<typeof getStats>> }) {
  if (!stats) return null;
  const { protocols_tracked: p, total_analyzed: n, verdicts } = stats;
  const safe = verdicts?.SAFE ?? 0;
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="border-rule bg-wash/60 rounded-xl border px-6 py-7 sm:px-8">
        <p className="text-ink-2 max-w-[76ch] text-base leading-relaxed sm:text-lg">
          <span className="text-ink font-semibold">
            {p} protocol{p === 1 ? "" : "s"} scored
          </span>{" "}
          so far, across {n} assessment{n === 1 ? "" : "s"} — every one of them
          written on chain after five validators independently agreed on the
          figures, and {safe} of them currently rated safe. Each rating keeps the
          evidence it was derived from, so none of these numbers has to be taken
          on trust.
        </p>
        <p className="text-ink-3 mt-3 text-sm">
          <Link href="/protocols" className="text-accent hover:text-accent-dark font-semibold">
            Browse every rating
          </Link>{" "}
          or{" "}
          <Link href="/docs" className="text-accent hover:text-accent-dark font-semibold">
            read how the score is built
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────── the ask */

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-2 pb-20 sm:px-6">
      <div className="border-rule rounded-xl border bg-white px-6 py-10 text-center sm:px-8 sm:py-12">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Check a protocol before you trust it
        </h2>
        <p className="text-ink-2 mx-auto mt-3 max-w-[52ch] leading-relaxed">
          Free on this testnet, and no wallet required — the site submits on your
          behalf. A rating takes about thirty seconds.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/analyze"
            className="bg-accent hover:bg-accent-dark rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors"
          >
            Analyze a protocol
          </Link>
          <Link
            href="/protocols"
            className="border-rule-2 hover:bg-wash rounded-lg border bg-white px-6 py-3 text-sm font-semibold transition-colors"
          >
            Browse scored protocols
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────── icons
 * Drawn inline: five small glyphs are not worth an icon dependency, and these
 * inherit currentColor and need no network request.
 */

function Shield() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 2.5 3.75 5v4.6c0 3.6 2.5 6.6 6.25 7.9 3.75-1.3 6.25-4.3 6.25-7.9V5L10 2.5Z"
        stroke="#2563eb" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m7.4 9.9 1.9 1.9 3.4-3.6" stroke="#2563eb" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Globe() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7.25" stroke="#2563eb" strokeWidth="1.4" />
      <path d="M2.75 10h14.5M10 2.75c1.9 2 2.9 4.6 2.9 7.25s-1 5.25-2.9 7.25c-1.9-2-2.9-4.6-2.9-7.25s1-5.25 2.9-7.25Z"
        stroke="#2563eb" strokeWidth="1.4" />
    </svg>
  );
}

function Plug() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M7.5 2.75v4M12.5 2.75v4" stroke="#2563eb" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 6.75h10v3a5 5 0 0 1-10 0v-3Z" stroke="#2563eb" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 14.75v2.5" stroke="#2563eb" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Cursor() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4.5 3.25 15 9.4l-4.3 1.1-1.9 4.2L4.5 3.25Z" stroke="#1c1917"
        strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function Nodes() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="4" r="2" stroke="#1c1917" strokeWidth="1.3" />
      <circle cx="4" cy="15" r="2" stroke="#1c1917" strokeWidth="1.3" />
      <circle cx="16" cy="15" r="2" stroke="#1c1917" strokeWidth="1.3" />
      <path d="M8.7 5.8 5.3 13.2M11.3 5.8l3.4 7.4M6 15h8" stroke="#1c1917" strokeWidth="1.3" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7.25" stroke="#1c1917" strokeWidth="1.3" />
      <path d="m6.6 10.2 2.3 2.3 4.5-4.8" stroke="#16a34a" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Ledger() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3.75" y="2.75" width="12.5" height="14.5" rx="1.5" stroke="#1c1917" strokeWidth="1.3" />
      <path d="M6.75 7h6.5M6.75 10h6.5M6.75 13h4" stroke="#1c1917" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
