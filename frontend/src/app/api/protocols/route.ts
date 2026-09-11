import { NextResponse } from "next/server";
import { LLAMA } from "@/lib/genlayer";
import type { LlamaProtocol } from "@/lib/types";

export const revalidate = 1800;

type Row = {
  slug?: string; name?: string; category?: string; tvl?: number;
  chains?: string[]; logo?: string; parentProtocolSlug?: string;
};

let cache: { at: number; rows: LlamaProtocol[] } | null = null;
/** DeFi Llama serves /protocols from a 30-minute cache of its own, so matching
 *  that here costs nothing and keeps an 8.8 MB fetch off the hot path. */
const TTL = 30 * 60 * 1000;

/**
 * The autocomplete source.
 *
 * `/protocols` is 8.8 MB and 8,227 rows. Sending that to a browser to filter a
 * text input would be absurd, so it is fetched once per half hour on the server,
 * trimmed to the six fields the picker shows, and served as ~1 MB — with a
 * `q` parameter so the common case never transfers the whole list at all.
 *
 * Parent protocols are synthesised back in, because they are not rows: `aave`
 * is the name most people will type and it exists only as the parent of
 * `aave-v3`. A picker that could not offer it would send everyone to a refusal.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get("limit") ?? 25) || 25, 100);

  let rows = cache && Date.now() - cache.at < TTL ? cache.rows : null;
  if (!rows) {
    try {
      const res = await fetch(`${LLAMA}/protocols`, { next: { revalidate: 1800 } });
      if (!res.ok) throw new Error(`llama ${res.status}`);
      const raw = (await res.json()) as Row[];
      const parents = new Map<string, LlamaProtocol>();
      const children: LlamaProtocol[] = [];
      for (const r of raw) {
        if (!r?.slug) continue;
        const row: LlamaProtocol = {
          slug: String(r.slug),
          name: String(r.name ?? r.slug),
          category: String(r.category ?? ""),
          tvl: Number(r.tvl ?? 0),
          chains: Array.isArray(r.chains) ? r.chains.length : 0,
          logo: r.logo,
          parent: r.parentProtocolSlug ? String(r.parentProtocolSlug) : undefined,
        };
        children.push(row);
        const p = r.parentProtocolSlug;
        if (p) {
          const prior = parents.get(p);
          parents.set(p, {
            slug: p,
            name: prettyParent(p),
            category: (prior?.tvl ?? 0) >= row.tvl ? (prior?.category ?? row.category) : row.category,
            tvl: (prior?.tvl ?? 0) + row.tvl,
            chains: Math.max(prior?.chains ?? 0, row.chains),
          });
        }
      }
      rows = [...parents.values(), ...children].sort((a, b) => b.tvl - a.tvl);
      cache = { at: Date.now(), rows };
    } catch (e) {
      return NextResponse.json(
        { ok: false, reason: `DeFi Llama did not answer: ${(e as Error).message}`, protocols: [] },
        { status: 502 },
      );
    }
  }

  if (!q) {
    return NextResponse.json({ ok: true, total: rows.length, protocols: rows.slice(0, limit) });
  }
  // Prefix matches first — somebody typing "aave" wants Aave, not
  // "Aavegotchi-adjacent-thing" that happens to contain the letters.
  const starts: LlamaProtocol[] = [];
  const contains: LlamaProtocol[] = [];
  for (const r of rows) {
    const s = r.slug.toLowerCase();
    const n = r.name.toLowerCase();
    if (s.startsWith(q) || n.startsWith(q)) starts.push(r);
    else if (s.includes(q) || n.includes(q)) contains.push(r);
    if (starts.length >= limit) break;
  }
  return NextResponse.json({
    ok: true, total: rows.length,
    protocols: [...starts, ...contains].slice(0, limit),
  });
}

function prettyParent(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
