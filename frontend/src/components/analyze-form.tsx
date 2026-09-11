"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VerdictBadge } from "./verdict-badge";
import { usd } from "@/lib/format";
import type { LlamaProtocol, Verdict } from "@/lib/types";

type Preview = {
  ok: boolean;
  slug?: string;
  reason?: string;
  analysed_before?: boolean;
  cooldown_remaining_s?: number;
  paused?: boolean;
  latest?: { verdict: Verdict; overall_score: number; slug: string; name: string };
  detail_url?: string;
};

type Result = {
  ok: boolean;
  rejected?: boolean;
  reason?: string;
  hash?: string;
  explorer?: string;
  seconds?: number;
  slug?: string;
  result?: Record<string, unknown>;
};

export function AnalyzeForm({ initialSlug = "" }: { initialSlug?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialSlug);
  const [picked, setPicked] = useState<LlamaProtocol | null>(null);
  const [options, setOptions] = useState<LlamaProtocol[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const slug = useMemo(() => picked?.slug ?? query.trim().toLowerCase().replace(/\s+/g, "-"), [picked, query]);

  // Autocomplete. Debounced, because the source is an 8.8 MB document that the
  // server trims — hammering it per keystroke helps nobody.
  useEffect(() => {
    const q = query.trim();
    let live = true;
    const t = setTimeout(async () => {
      if (q.length < 2) {
        if (live) setOptions([]);
        return;
      }
      try {
        const res = await fetch(`/api/protocols?q=${encodeURIComponent(q)}&limit=8`);
        const body = await res.json();
        if (live) setOptions(body.protocols ?? []);
      } catch {
        if (live) setOptions([]);
      }
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  // What the contract would make of this string, before spending anything.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      if (!slug) {
        if (live) setPreview(null);
        return;
      }
      try {
        const res = await fetch(`/api/preview?slug=${encodeURIComponent(slug)}`);
        const body = await res.json();
        if (live) setPreview(body);
      } catch {
        if (live) setPreview(null);
      }
    }, 260);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [slug]);

  /* The elapsed counter is DERIVED from the moment the submit handler recorded,
     rather than reset inside the effect. An effect that writes state in its own
     body triggers a cascading render on every run, and the start time is
     something the click already knows. */
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const running = startedAt !== null;
  const cooling = Number(preview?.cooldown_remaining_s ?? 0) > 0;
  const blocked = !slug || running || preview?.ok === false || cooling || preview?.paused === true;

  async function submit() {
    if (blocked) return;
    setStartedAt(Date.now());
    setElapsed(0);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = (await res.json()) as Result;
      setResult(body);
      if (body.ok && body.slug) {
        router.refresh();
        setTimeout(() => router.push(`/protocol/${body.slug}`), 1400);
      }
    } catch (e) {
      setResult({ ok: false, reason: `The request did not complete: ${(e as Error).message}` });
    } finally {
      setStartedAt(null);
    }
  }

  return (
    <div className="space-y-5">
      <div ref={boxRef} className="relative">
        <label htmlFor="protocol" className="mb-1.5 block text-sm font-medium">
          Protocol
        </label>
        <input
          id="protocol"
          value={query}
          autoComplete="off"
          spellCheck={false}
          placeholder="aave-v3, uniswap, lido…"
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
            setOpen(true);
            setCursor(-1);
            setResult(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setCursor((c) => Math.min(c + 1, options.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, -1)); }
            else if (e.key === "Enter") {
              if (open && cursor >= 0 && options[cursor]) {
                e.preventDefault();
                choose(options[cursor]);
              } else if (!blocked) {
                e.preventDefault();
                submit();
              }
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="border-rule-2 focus:border-accent w-full rounded-lg border bg-white px-3.5 py-2.5 text-base outline-none"
        />
        {open && options.length > 0 && (
          <ul
            role="listbox"
            className="card-raised absolute z-20 mt-1.5 max-h-80 w-full overflow-auto p-1"
          >
            {options.map((o, i) => (
              <li key={`${o.slug}-${i}`}>
                <button
                  type="button"
                  onClick={() => choose(o)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left ${
                    i === cursor ? "bg-accent-wash" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.name}</span>
                    <span className="text-ink-3 block truncate font-mono text-xs">{o.slug}</span>
                  </span>
                  <span className="text-ink-3 shrink-0 text-right text-xs">
                    <span className="tnum block">{usd(o.tvl)}</span>
                    <span className="block">{o.category || "—"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-ink-3 mt-1.5 text-xs">
          Names come straight from DeFi Llama. Families work too — typing{" "}
          <span className="font-mono">aave</span> rates every Aave market together.
        </p>
      </div>

      {preview && <PreviewCard preview={preview} slug={slug} />}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={blocked}
          className="bg-accent hover:bg-accent-dark disabled:bg-ink-4 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
        >
          {running ? `Analyzing… ${elapsed}s` : "Analyze this protocol"}
        </button>
        {running && (
          <span className="text-ink-3 text-sm">
            Five validators are fetching DeFi Llama right now. This usually takes
            10–40 seconds.
          </span>
        )}
      </div>

      {result && <ResultPanel result={result} />}
    </div>
  );

  function choose(o: LlamaProtocol) {
    setPicked(o);
    setQuery(o.slug);
    setOpen(false);
    setCursor(-1);
    setResult(null);
  }
}

function PreviewCard({ preview, slug }: { preview: Preview; slug: string }) {
  if (preview.ok === false) {
    return (
      <div className="border-risk-rule bg-risk-wash rounded-lg border px-4 py-3">
        <p className="text-risk text-sm font-medium">That name will not resolve</p>
        <p className="text-ink-2 mt-1 text-sm leading-relaxed">{preview.reason}</p>
      </div>
    );
  }
  const cooldown = Number(preview.cooldown_remaining_s ?? 0);
  return (
    <div className="card space-y-3 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm">
            Will be submitted as{" "}
            <span className="font-mono font-medium">{preview.slug ?? slug}</span>
          </p>
          <p className="text-ink-3 mt-0.5 text-xs">
            Fee: free on this testnet. Submitted from a shared relayer wallet.
          </p>
        </div>
        {preview.latest && (
          <Link
            href={`/protocol/${preview.latest.slug}`}
            className="hover:bg-wash flex items-center gap-2.5 rounded-lg px-2 py-1"
          >
            <span className="text-ink-3 text-xs">Already rated</span>
            <VerdictBadge verdict={preview.latest.verdict} size="sm" />
            <span className="tnum text-sm font-semibold">{preview.latest.overall_score}</span>
          </Link>
        )}
      </div>
      {cooldown > 0 && (
        <p className="border-moderate-rule bg-moderate-wash text-ink-2 rounded-md border px-3 py-2 text-xs leading-relaxed">
          This protocol was rated in the last 15 minutes. The contract will refuse
          a re-rating for another{" "}
          <span className="tnum font-medium">{Math.ceil(cooldown / 60)} min</span>{" "}
          — the cooldown stops one protocol from filling the oracle.
        </p>
      )}
      {preview.paused && (
        <p className="border-moderate-rule bg-moderate-wash text-ink-2 rounded-md border px-3 py-2 text-xs">
          The oracle is paused for new ratings. Existing ratings are still readable.
        </p>
      )}
    </div>
  );
}

function ResultPanel({ result }: { result: Result }) {
  if (result.ok) {
    const r = (result.result ?? {}) as Record<string, unknown>;
    const verdict = String(r.verdict ?? "UNKNOWN") as Verdict;
    return (
      <div className="border-safe-rule bg-safe-wash rounded-lg border px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Analyzed in {result.seconds}s</p>
            <p className="text-ink-2 mt-1 text-sm">
              {String(r.name ?? result.slug)} scored{" "}
              <span className="tnum font-semibold">{String(r.overall_score ?? "—")}</span>
              /100. Opening the full breakdown…
            </p>
          </div>
          <VerdictBadge verdict={verdict} size="lg" />
        </div>
        <Links result={result} />
      </div>
    );
  }
  const refused = result.rejected;
  const suggestions = (result.result as { did_you_mean?: string[] })?.did_you_mean ?? [];
  return (
    <div
      className={`rounded-lg border px-4 py-4 ${
        refused ? "border-moderate-rule bg-moderate-wash" : "border-risk-rule bg-risk-wash"
      }`}
    >
      <p className="font-semibold">
        {refused ? "The contract refused this" : "That did not go through"}
      </p>
      <p className="text-ink-2 mt-1 text-sm leading-relaxed">{result.reason}</p>
      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-ink-3 text-xs">Protocols that do exist with that name:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <Link
                key={s}
                href={`/analyze?slug=${encodeURIComponent(s)}`}
                className="border-rule-2 hover:border-accent hover:text-accent rounded-md border bg-white px-2 py-1 font-mono text-xs"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}
      {refused && (
        <p className="text-ink-3 mt-3 text-xs leading-relaxed">
          A refusal is a successful transaction that returns a reason and refunds
          anything sent — the contract never reverts once value is attached.
        </p>
      )}
      <Links result={result} />
    </div>
  );
}

function Links({ result }: { result: Result }) {
  if (!result.explorer) return null;
  return (
    <p className="mt-3 text-xs">
      <a
        href={result.explorer}
        target="_blank"
        rel="noreferrer"
        className="text-accent hover:text-accent-dark font-mono underline underline-offset-2"
      >
        {result.hash?.slice(0, 18)}…
      </a>
      <span className="text-ink-3"> on the GenLayer explorer</span>
    </p>
  );
}
