"use client";

import { useCallback, useEffect, useState } from "react";
import { CHAIN, CHAIN_HEX, CHAIN_PARAMS } from "@/lib/chain";

/**
 * First-run setup, shared by /analyze and /docs.
 *
 * Three things a newcomer needs and cannot guess: that rating a protocol needs
 * no wallet at all, how to put Studio Dev in the wallet they do have, and where
 * test GEN comes from. Each step DOES the thing rather than describing it —
 * "add chain 61997 with RPC https://…" is a set of instructions to follow by
 * hand, and every hand-followed instruction is somewhere to make a typo.
 */

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const eth = (): Eth | null =>
  typeof window === "undefined" ? null : ((window as unknown as { ethereum?: Eth }).ethereum ?? null);

export function Onboarding({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [address, setAddress] = useState<string | null>(null);
  const [netState, setNetState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [fund, setFund] = useState<
    { state: "idle" | "busy" | "done" | "error"; msg?: string; url?: string }
  >({ state: "idle" });

  useEffect(() => {
    const p = eth();
    if (!p) return;
    p.request({ method: "eth_accounts" })
      .then((a) => setAddress((a as string[])?.[0] ?? null))
      .catch(() => {});
  }, []);

  const addNetwork = useCallback(async () => {
    const p = eth();
    if (!p) {
      window.open("https://metamask.io/download/", "_blank", "noreferrer");
      return;
    }
    setNetState("busy");
    try {
      try {
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
      } catch (e) {
        if ((e as { code?: number })?.code === 4902) {
          await p.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
        } else if ((e as { code?: number })?.code !== 4001) {
          throw e;
        }
      }
      const accts = (await p.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accts?.[0] ?? null);
      setNetState("done");
    } catch {
      setNetState("error");
    }
  }, []);

  const getFunds = useCallback(async () => {
    let to = address;
    if (!to) {
      const p = eth();
      if (!p) {
        setFund({ state: "error", msg: "Connect a wallet first — there is nowhere to send it." });
        return;
      }
      try {
        to = ((await p.request({ method: "eth_requestAccounts" })) as string[])?.[0] ?? null;
        setAddress(to);
      } catch {
        setFund({ state: "error", msg: "Connect a wallet first — there is nowhere to send it." });
        return;
      }
    }
    setFund({ state: "busy" });
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: to }),
      });
      const body = await res.json();
      setFund(
        body.ok
          ? { state: "done", msg: `${body.amount} sent to your wallet.`, url: body.explorer }
          : { state: "error", msg: body.reason ?? "The faucet did not answer." },
      );
    } catch (e) {
      setFund({ state: "error", msg: (e as Error).message });
    }
  }, [address]);

  return (
    <section className="border-accent-rule bg-accent-wash/60 rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Spark />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">First time here?</span>
            <span className="text-ink-3 block truncate text-xs">
              Rating a protocol needs no wallet. This is only for calling the oracle yourself.
            </span>
          </span>
        </span>
        <span className="text-ink-3 shrink-0 text-xs">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-accent-rule/70 space-y-3 border-t px-4 py-4 sm:px-5">
          <Step
            n={1}
            title="You do not need a wallet to rate a protocol"
            body="Studio Dev is a faucet-funded testnet and a rating costs nothing, so this site submits through a shared relayer. Type a name and press the button — that is the whole flow."
          />
          <Step
            n={2}
            title="Add GenLayer Studio Dev to your wallet"
            body={`Chain ${CHAIN.id} · ${CHAIN.currency.symbol}. The button adds it and switches for you.`}
            action={
              <button
                type="button"
                onClick={addNetwork}
                disabled={netState === "busy"}
                className="border-rule-2 hover:border-accent hover:text-accent shrink-0 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                {netState === "busy"
                  ? "Opening wallet…"
                  : netState === "done"
                    ? "Network added ✓"
                    : netState === "error"
                      ? "Try again"
                      : "Add network"}
              </button>
            }
          />
          <Step
            n={3}
            title="Get test GEN"
            body="The faucet sends 100 test GEN to your address. It has no value and exists only on this devnet."
            action={
              <button
                type="button"
                onClick={getFunds}
                disabled={fund.state === "busy"}
                className="border-rule-2 hover:border-accent hover:text-accent shrink-0 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                {fund.state === "busy" ? "Sending…" : fund.state === "done" ? "Sent ✓" : "Get 100 GEN"}
              </button>
            }
          />

          {fund.msg && (
            <p
              className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                fund.state === "done"
                  ? "border-safe-rule bg-safe-wash text-ink-2"
                  : "border-risk-rule bg-risk-wash text-ink-2"
              }`}
            >
              {fund.msg}
              {fund.url && (
                <>
                  {" "}
                  <a
                    href={fund.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent font-mono underline underline-offset-2"
                  >
                    view transaction
                  </a>
                </>
              )}
            </p>
          )}

          <dl className="border-accent-rule/70 text-ink-3 grid gap-x-6 gap-y-1.5 border-t pt-3 text-xs sm:grid-cols-2">
            <Fact k="Network" v={CHAIN.name} />
            <Fact k="Chain ID" v={String(CHAIN.id)} />
            <Fact k="Currency" v={CHAIN.currency.symbol} />
            <Fact k="RPC" v={CHAIN.rpc} mono />
          </dl>
        </div>
      )}
    </section>
  );
}

function Step({
  n, title, body, action,
}: {
  n: number; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
      <span className="border-accent-rule text-accent tnum mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-white text-xs font-semibold">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-ink-2 mt-0.5 max-w-[58ch] text-xs leading-relaxed">{body}</p>
      </div>
      {action}
    </div>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0">{k}</dt>
      <dd className={`text-ink-2 min-w-0 truncate text-right ${mono ? "font-mono" : "tnum"}`} title={v}>
        {v}
      </dd>
    </div>
  );
}

function Spark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0">
      <circle cx="9" cy="9" r="7.25" stroke="#2563eb" strokeWidth="1.4" />
      <path d="M9 5.5v4.2M9 12.3v.2" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
