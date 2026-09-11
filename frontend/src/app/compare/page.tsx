import type { Metadata } from "next";
import Link from "next/link";
import { getProtocols, getAssessment, getRecent } from "@/lib/oracle";
import { CompareView } from "@/components/compare-view";
import type { Assessment } from "@/lib/types";

export const metadata: Metadata = {
  title: "Compare protocols — DeFiLens",
  description: "Two protocols side by side on the same rubric, dimension by dimension.",
};

export const revalidate = 30;

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a: qa, b: qb } = await searchParams;
  const protocols = (await getProtocols(50)).filter((p) => p.verdict !== "UNKNOWN");

  if (protocols.length < 2) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Nothing to compare yet</h1>
        <p className="text-ink-2 mx-auto mt-3 max-w-[46ch] leading-relaxed">
          Comparison needs at least two rated protocols. The oracle currently
          holds {protocols.length}.
        </p>
        <Link href="/analyze" className="bg-accent hover:bg-accent-dark mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white">
          Rate a protocol
        </Link>
      </div>
    );
  }

  const left = protocols.find((p) => p.slug === qa)?.slug ?? protocols[0].slug;
  const right = protocols.find((p) => p.slug === qb && p.slug !== left)?.slug
    ?? protocols.find((p) => p.slug !== left)!.slug;

  /* One `get_recent` covers most of the table; anything it missed is fetched
     individually below. Twenty separate reads would exhaust Studio's per-minute
     budget on a single page render. */
  const assessments: Record<string, Assessment> = {};
  for (const a of await getRecent(40)) {
    if (!assessments[a.slug]) assessments[a.slug] = a;
  }
  for (const slug of [left, right]) {
    if (!assessments[slug]) {
      const a = await getAssessment(slug);
      if (a) assessments[slug] = a;
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Compare</h1>
      <p className="text-ink-2 mt-3 max-w-[58ch] leading-relaxed">
        Two protocols on the same rubric. The comparison means something because
        both went through identical arithmetic on data pulled the same way — not
        because two analysts happened to look at both.
      </p>

      <div className="mt-8">
        <CompareView
          protocols={protocols.filter((p) => assessments[p.slug])}
          assessments={assessments}
          initial={[left, right]}
        />
      </div>
    </div>
  );
}
