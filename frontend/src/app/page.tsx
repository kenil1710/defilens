import Link from "next/link";
import { getStats, getSafest, getRiskiest, getAssessment, getProtocols, getRecent } from "@/lib/oracle";
import { RatingCard, RatingRow } from "@/components/rating-card";
import { VerdictBadge } from "@/components/verdict-badge";
import { DIMENSION_META, DIMENSIONS } from "@/lib/types";
import type { Dimension } from "@/lib/types";
import { usd } from "@/lib/format";
import { ORACLE_ADDRESS, addressUrl } from "@/lib/genlayer";
import type { Assessment } from "@/lib/types";

export const revalidate = 30;

export default async function Home() {
  const [stats, safest, riskiest, protocols] = await Promise.all([
    getStats(), getSafest(6), getRiskiest(6), getProtocols(40),
  ]);

  // The hero is a REAL rating, live from the contract. A protocol at each end of
  // the scale, because the contrast is the product: an oracle where everything
  // scores safe is an oracle that measures nothing.
  const bestSlug = safest[0]?.slug;
  const worstSlug = riskiest.find((p) => p.slug !== bestSlug)?.slug;
  const [hero, foil] = await Promise.all([
    bestSlug ? getAssessment(bestSlug) : null,
    worstSlug ? getAssessment(worstSlug) : null,
  ]);

  /*
   * ONE call, not eight.
   *
   * `get_recent` returns whole assessments, so fetching each protocol
   * separately here would spend eight of the thirty reads a minute that Studio
   * allows, to learn what one read already answered. Duplicates are collapsed
   * because a protocol rated twice appears twice in the feed and should appear
   * once in a list of protocols.
   */
  const seen = new Set<string>();
  const recentRatings = (await getRecent(16))
    .filter((a) => (seen.has(a.slug) ? false : (seen.add(a.slug), true)))
    .slice(0, 8);

  return (
    <>
      <Hero stats={stats} hero={hero} foil={foil} />
      <HowItWorks />
      <Dimensions />
      <LiveRatings ratings={recentRatings} total={protocols.length} />
      <ForContracts />
    </>
  );
}

function Hero({
  stats, hero, foil,
}: {
  stats: Awaited<ReturnType<typeof getStats>>;
  hero: Assessment | null;
  foil: Assessment | null;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-16">
        <div className="rise">
          <h1 className="text-[2.75rem] leading-[1.05] font-bold tracking-tight sm:text-6xl">
            Know before
            <br />
            you deposit.
          </h1>
          <p className="text-ink-2 mt-6 max-w-[52ch] text-lg leading-relaxed">
            Name any DeFi protocol. Five GenLayer validators independently fetch
            DeFi Llama&apos;s public data, score it across five dimensions, and
            have to agree on every number before one of them is written on chain.
          </p>
          <p className="text-ink-3 mt-4 max-w-[52ch] leading-relaxed">
            The rating is stored with the evidence it came from, so anyone can
            recompute it — and any contract can read it before it moves money.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/analyze"
              className="bg-accent hover:bg-accent-dark rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              Rate a protocol
            </Link>
            <Link
              href="/protocols"
              className="border-rule-2 hover:bg-wash rounded-lg border bg-white px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              Browse {stats?.protocols_tracked ?? 0} ratings
            </Link>
          </div>

          {stats && (
            <dl className="border-rule mt-10 grid max-w-lg grid-cols-2 gap-x-8 gap-y-5 border-t pt-6 sm:grid-cols-4">
              <Stat label="Protocols" value={stats.protocols_tracked} />
              <Stat label="Assessments" value={stats.total_analyzed} />
              <Stat label="Average score" value={stats.average_score} />
              <Stat label="Rated safe" value={stats.verdicts?.SAFE ?? 0} />
            </dl>
          )}
        </div>

        <div className="rise space-y-4" style={{ animationDelay: "120ms" }}>
          {hero ? (
            <RatingCard a={hero} animate href={`/protocol/${hero.slug}`} />
          ) : (
            <EmptyHero />
          )}
          {foil && (
            <Link
              href={`/protocol/${foil.slug}`}
              className="card hover:bg-wash block px-5 py-4 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{foil.name}</p>
                  <p className="text-ink-3 tnum truncate text-xs">
                    {foil.category} · {usd(foil.tvl_usd)} · {foil.chain_count}{" "}
                    {foil.chain_count === 1 ? "chain" : "chains"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <VerdictBadge verdict={foil.verdict} size="sm" />
                  <span className="tnum text-lg font-bold">{foil.overall_score}</span>
                </div>
              </div>
              <p className="text-ink-3 mt-2.5 text-xs leading-relaxed">
                Same rubric, same validators, a different answer. The weakest
                dimension here is{" "}
                <span className="text-ink-2 font-medium">
                  {weakest(foil)}
                </span>
                .
              </p>
            </Link>
          )}
          <p className="text-ink-4 px-1 text-xs leading-relaxed">
            Both ratings are read live from{" "}
            <a href={addressUrl(ORACLE_ADDRESS)} target="_blank" rel="noreferrer"
              className="hover:text-accent font-mono underline underline-offset-2">
              {ORACLE_ADDRESS.slice(0, 10)}…
            </a>{" "}
            on GenLayer Studio Dev.
          </p>
        </div>
      </div>
    </section>
  );
}

function weakest(a: Assessment): string {
  let key: Dimension = DIMENSIONS[0];
  let low = 101;
  for (const d of DIMENSIONS) {
    const v = Number(a.scores?.[d] ?? 0);
    if (v < low) {
      low = v;
      key = d;
    }
  }
  return `${DIMENSION_META[key].label.toLowerCase()} at ${low}`;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dd className="tnum text-2xl font-bold tracking-tight">{value}</dd>
      <dt className="text-ink-3 mt-0.5 text-xs">{label}</dt>
    </div>
  );
}

function EmptyHero() {
  return (
    <div className="card-raised px-6 py-10 text-center">
      <p className="text-sm font-semibold">No ratings yet</p>
      <p className="text-ink-3 mx-auto mt-2 max-w-[32ch] text-sm leading-relaxed">
        The oracle is deployed and answering; nothing has been rated on it yet.
      </p>
      <Link
        href="/analyze"
        className="bg-accent hover:bg-accent-dark mt-5 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white"
      >
        Rate the first protocol
      </Link>
    </div>
  );
}

/* A genuine sequence, so it is numbered. */
const STEPS = [
  {
    title: "You name a protocol",
    body: "A DeFi Llama slug — aave-v3, or just aave. Families resolve to their children; a name that does not exist comes back with the nearest ones that do.",
  },
  {
    title: "Five validators fetch it independently",
    body: "Each one pulls the protocol list and the protocol's TVL history straight from api.llama.fi, reduces them to sixteen integers, and scores those integers with the same arithmetic.",
  },
  {
    title: "They have to agree, exactly",
    body: "Live figures are bucketed first — TVL to three significant figures, percentages to the nearest five — so honest nodes match byte for byte. Disagreement writes nothing at all.",
  },
  {
    title: "The rating is stored with its evidence",
    body: "Every stored number is recomputed from the agreed vector after consensus, never taken from the leader. verify_assessment replays the arithmetic on demand.",
  },
];

function HowItWorks() {
  return (
    <section className="border-rule bg-white border-y">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">How a rating is made</h2>
        <p className="text-ink-3 mt-2 max-w-[60ch] leading-relaxed">
          The point of putting this on GenLayer is that no single party — including
          whoever runs the site — gets to decide what a protocol scores.
        </p>
        <ol className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="border-rule-2 text-ink-3 tnum mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-ink-2 mt-1.5 max-w-[46ch] text-sm leading-relaxed">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

async function Dimensions() {
  const stats = await getStats();
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">What gets measured</h2>
          <p className="text-ink-3 mt-2 max-w-[58ch] leading-relaxed">
            Five dimensions, each bucketed 0–7 and weighted. Nothing here is a
            judgement call — every bucket is an integer function of public data.
          </p>
        </div>
        <Link href="/docs" className="text-accent hover:text-accent-dark text-sm font-semibold">
          Read the full methodology
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="ledger w-full min-w-[620px] text-sm">
          <thead>
            <tr>
              <th className="w-40">Dimension</th>
              <th className="w-16 text-right">Weight</th>
              <th>What it asks</th>
              <th className="w-24 text-right">Average</th>
            </tr>
          </thead>
          <tbody>
            {DIMENSIONS.map((key) => {
              const meta = DIMENSION_META[key];
              const avg = stats?.average_dimensions?.[key];
              return (
                <tr key={key}>
                  <td className="font-medium">{meta.label}</td>
                  <td className="tnum text-ink-2 text-right">{meta.weight}%</td>
                  <td className="text-ink-2 max-w-[40ch] leading-relaxed">{meta.asks}</td>
                  <td className="tnum text-ink-3 text-right">
                    {avg === undefined ? "\u2014" : avg}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-ink-3 mt-5 max-w-[68ch] text-sm leading-relaxed">
        A language model is used in exactly one place: reading whether a
        protocol&apos;s published audit evidence is substantive. It chooses between
        two adjacent options that the deterministic code has already narrowed to,
        and it is worth at most four points of a hundred.
      </p>
    </section>
  );
}

function LiveRatings({ ratings, total }: { ratings: Assessment[]; total: number }) {
  if (ratings.length === 0) return null;
  return (
    <section className="border-rule bg-white border-y">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight">Rated so far</h2>
          <Link href="/protocols" className="text-accent hover:text-accent-dark text-sm font-semibold">
            All {total} protocols
          </Link>
        </div>
        <div className="border-rule mt-6 overflow-hidden rounded-xl border">
          {ratings.map((a) => (
            <RatingRow key={a.slug} a={a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ForContracts() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-16">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            A rating a contract can act on
          </h2>
          <p className="text-ink-2 mt-3 max-w-[54ch] leading-relaxed">
            The oracle is not a website with an API bolted on. Every rating is a
            view call, so a yield aggregator deciding where to route deposits can
            ask before it moves money — and get an answer it can branch on rather
            than an exception it has to catch.
          </p>
          <p className="text-ink-3 mt-4 max-w-[54ch] leading-relaxed">
            <span className="text-ink font-medium">DeFiConsumer</span> is deployed
            alongside it as a worked example: an aggregator that refuses any
            protocol rated high risk, any protocol nobody has rated, and any
            rating older than its own staleness limit.
          </p>
          <Link href="/docs#integrate" className="text-accent hover:text-accent-dark mt-5 inline-block text-sm font-semibold">
            Integration guide
          </Link>
        </div>
        <pre className="border-rule overflow-x-auto rounded-xl border bg-[#1c1917] p-5 font-mono text-[12.5px] leading-relaxed text-[#e7e5e4]">
<span className="text-[#a8a29e]"># refuses HIGH_RISK, UNKNOWN and never-rated alike</span>{"\n"}
<span className="text-[#93c5fd]">summary</span> = IDeFiLens(oracle).view().get_risk_summary(slug){"\n"}
{"\n"}
<span className="text-[#c4b5fd]">if</span> <span className="text-[#c4b5fd]">not</span> summary[<span className="text-[#86efac]">&quot;found&quot;</span>]:{"\n"}
{"    "}<span className="text-[#c4b5fd]">return</span> self._refuse(slug, <span className="text-[#86efac]">&quot;nobody has rated this&quot;</span>){"\n"}
<span className="text-[#c4b5fd]">if</span> summary[<span className="text-[#86efac]">&quot;verdict&quot;</span>] == <span className="text-[#86efac]">&quot;HIGH_RISK&quot;</span>:{"\n"}
{"    "}<span className="text-[#c4b5fd]">return</span> self._refuse(slug, <span className="text-[#86efac]">&quot;DeFiLens rates this HIGH_RISK&quot;</span>){"\n"}
<span className="text-[#c4b5fd]">if</span> summary[<span className="text-[#86efac]">&quot;overall_score&quot;</span>] &lt; self.min_score:{"\n"}
{"    "}<span className="text-[#c4b5fd]">return</span> self._refuse(slug, <span className="text-[#86efac]">&quot;below our floor&quot;</span>){"\n"}
{"\n"}
<span className="text-[#a8a29e]"># the evidence that admitted this deposit, pinned</span>{"\n"}
pos.assessment_id = u32(summary[<span className="text-[#86efac]">&quot;assessment_id&quot;</span>]){"\n"}
pos.content_hash = <span className="text-[#93c5fd]">str</span>(summary[<span className="text-[#86efac]">&quot;content_hash&quot;</span>])
        </pre>
      </div>
    </section>
  );
}
