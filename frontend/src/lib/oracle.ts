import "server-only";
import { ORACLE_ADDRESS, CONSUMER_ADDRESS, readClient, retry } from "./genlayer";
import type {
  Assessment, Config, ProtocolSummary, Stats, Verification,
} from "./types";

/**
 * Every read of the oracle, in one place, on the server.
 *
 * Server-side because Studio Dev meters 30 RPC requests a minute per caller: a
 * page that read the contract from the browser would spend that budget once per
 * visitor and start failing for the second one. Here the reads are cached and
 * shared.
 */

/**
 * A process-wide memo with a TTL, in front of every read.
 *
 * GenLayer Studio meters THIRTY REQUESTS PER MINUTE per caller. Without this,
 * one page render costs a dozen calls, a static build of ten protocol pages
 * costs a hundred, and the rate limiter starts refusing reads that have nothing
 * wrong with them. Two visitors arriving together would each pay full price for
 * the same answer.
 *
 * In-flight requests are shared too, not just completed ones — otherwise ten
 * concurrent renders of the same page fire ten identical calls before the first
 * one lands, which is exactly the burst the limiter is watching for.
 */
type Entry = { at: number; value: unknown };
const memo = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MEMO_MS = 20_000;

const call = async <T>(fn: string, args: unknown[] = []): Promise<T> => {
  const key = `${fn}:${JSON.stringify(args)}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return (await pending) as T;

  const task = (async () => {
    const client = readClient();
    const value = await retry(() =>
      client.readContract({ address: ORACLE_ADDRESS, functionName: fn, args: args as never }),
    );
    memo.set(key, { at: Date.now(), value });
    // The map is bounded by the number of distinct calls this app can make,
    // which is small — but a long-lived process should still not grow forever.
    if (memo.size > 400) {
      for (const [k, v] of memo) if (Date.now() - v.at > MEMO_MS) memo.delete(k);
    }
    return value;
  })().finally(() => inflight.delete(key));

  inflight.set(key, task);
  return (await task) as T;
};

/**
 * A short revalidation window rather than a long one, because the whole product
 * is a claim about freshness — a rating page that showed a day-old verdict
 * would be making exactly the mistake the oracle exists to prevent.
 */
const REVALIDATE = 30;

async function cached<T>(fn: string, args: unknown[] = [], fallback: T): Promise<T> {
  try {
    return await call<T>(fn, args);
  } catch (e) {
    console.error(`oracle.${fn} failed:`, (e as Error)?.message);
    return fallback;
  }
}

export const revalidate = REVALIDATE;

export const getConfig = () =>
  cached<Config | null>("get_config", [], null);

export const getStats = () =>
  cached<Stats | null>("get_stats", [], null);

export async function getProtocols(limit = 100): Promise<ProtocolSummary[]> {
  const out = await cached<{ protocols: ProtocolSummary[] }>(
    "get_protocols", [0, limit], { protocols: [] },
  );
  return out.protocols ?? [];
}

export async function getAssessment(slug: string): Promise<Assessment | null> {
  const out = await cached<Assessment | null>("get_assessment_by_slug", [slug], null);
  return out?.found ? out : null;
}

export async function getAssessmentById(id: number): Promise<Assessment | null> {
  const out = await cached<Assessment | null>("get_assessment", [id], null);
  return out?.found ? out : null;
}

export async function getHistory(slug: string, count = 6): Promise<Assessment[]> {
  const out = await cached<{ assessments: Assessment[] }>(
    "get_assessment_history", [slug, count], { assessments: [] },
  );
  return out.assessments ?? [];
}

export async function getRecent(count = 12): Promise<Assessment[]> {
  const out = await cached<{ assessments: Assessment[] }>(
    "get_recent", [count], { assessments: [] },
  );
  return out.assessments ?? [];
}

export async function getSafest(count = 6): Promise<ProtocolSummary[]> {
  const out = await cached<{ protocols: ProtocolSummary[] }>(
    "get_top_protocols", [count], { protocols: [] },
  );
  return out.protocols ?? [];
}

export async function getRiskiest(count = 6): Promise<ProtocolSummary[]> {
  const out = await cached<{ protocols: ProtocolSummary[] }>(
    "get_riskiest", [count], { protocols: [] },
  );
  return out.protocols ?? [];
}

export const verifyAssessment = (id: number) =>
  cached<Verification | null>("verify_assessment", [id], null);

export const previewSlug = (slug: string) =>
  cached<{
    ok: boolean; slug?: string; reason?: string; analysed_before?: boolean;
    cooldown_remaining_s?: number; fee_wei?: number | string; paused?: boolean;
    latest?: ProtocolSummary; detail_url?: string;
  } | null>("preview_slug", [slug], null);

export const getCategoryRisk = (category: string) =>
  cached<{
    category: string; ordinal: number; mapped: boolean; label: string;
    score_contribution: number; weight_pct: number; default_when_unmapped: number;
  } | null>("get_category_risk", [category], null);

/** The consumer contract's read surface — the composability demo. */
export async function consumerCheck(slug: string) {
  try {
    const client = readClient();
    return (await retry(() =>
      client.readContract({
        address: CONSUMER_ADDRESS, functionName: "check", args: [slug] as never,
      }),
    )) as {
      allowed: boolean; slug: string; verdict: string; score: number;
      min_score: number; assessment_age_s: number; max_assessment_age_s: number;
      assessment_id: number; content_hash: string; reason: string;
    };
  } catch {
    return null;
  }
}

export async function consumerConfig() {
  try {
    const client = readClient();
    return (await retry(() =>
      client.readContract({
        address: CONSUMER_ADDRESS, functionName: "get_config", args: [] as never,
      }),
    )) as {
      owner: string; oracle: string; min_score: number;
      max_assessment_age_s: number; paused: boolean; max_positions: number;
      policy: string;
    };
  } catch {
    return null;
  }
}
