"use client";

import { useState } from "react";
import type { Verification } from "@/lib/types";

/**
 * Recompute a stored rating from its own evidence, on demand.
 *
 * This is the difference between a rating that is signed and a rating that is
 * auditable. The evidence is the exact integer vector the validators agreed on;
 * the rubric is a set of constants; so the arithmetic replays to the same five
 * scores, the same verdict and the same content hash — years later, by anyone.
 */
export function VerifyPanel({ assessmentId }: { assessmentId: number }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [out, setOut] = useState<Verification | null>(null);
  const [reason, setReason] = useState("");

  async function run() {
    setState("running");
    try {
      const res = await fetch(`/api/verify?id=${assessmentId}`);
      const body = await res.json();
      if (!body || body.verified === undefined) {
        setReason(body?.reason ?? "The oracle did not answer.");
        setState("error");
        return;
      }
      setOut(body as Verification);
      setState("done");
    } catch (e) {
      setReason((e as Error).message);
      setState("error");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className="border-rule-2 hover:bg-wash disabled:text-ink-4 rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition-colors"
        >
          {state === "running" ? "Recomputing…" : "Recompute from evidence"}
        </button>
        {state === "idle" && (
          <span className="text-ink-3 max-w-[42ch] text-xs leading-relaxed">
            Runs <span className="font-mono">verify_assessment</span> on chain and
            compares every stored number against the arithmetic replayed from the
            agreed vector.
          </span>
        )}
      </div>

      {state === "error" && (
        <p className="border-risk-rule bg-risk-wash text-ink-2 mt-3 rounded-lg border px-3 py-2 text-sm">
          {reason}
        </p>
      )}

      {state === "done" && out && (
        <div
          className={`mt-3 rounded-lg border px-4 py-3.5 ${
            out.verified ? "border-safe-rule bg-safe-wash" : "border-risk-rule bg-risk-wash"
          }`}
        >
          <p className="text-sm font-semibold">
            {out.verified
              ? "Every stored value reproduces exactly"
              : "The stored record does not match its evidence"}
          </p>
          {out.verified ? (
            <>
              <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">
                The five dimension scores, the overall score, the verdict, the
                evidence bands and the content hash were all recomputed from the
                stored vector and matched what is on chain.
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                <Row k="Overall" v={String(out.recomputed.overall_score)} />
                <Row k="Verdict" v={out.recomputed.verdict} />
                <Row k="Audit" v={out.recomputed.audit_status} />
                <Row k="Rubric" v={`v${out.stored_rubric_version}`} />
                <Row k="Hash" v={out.recomputed.content_hash} mono />
              </dl>
            </>
          ) : (
            <ul className="text-ink-2 mt-2 space-y-1 font-mono text-xs">
              {out.differences.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3">{k}</dt>
      <dd className={`text-ink truncate font-medium ${mono ? "font-mono" : ""}`} title={v}>
        {v}
      </dd>
    </div>
  );
}
