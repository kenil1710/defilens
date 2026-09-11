"use client";

import { useCallback, useEffect, useState } from "react";
import { CHAIN_HEX, CHAIN_PARAMS, CHAIN } from "@/lib/chain";

/**
 * Wallet and network, on app pages only.
 *
 * Analysis itself goes through a server-side relayer, so a visitor never NEEDS
 * a wallet to use this product — demanding one before a free read-only rating
 * would be a toll gate on the thing being demonstrated. Connecting is offered
 * so a visitor can call the oracle themselves, and the network is switched for
 * them rather than being described in an error message: a site that says "wrong
 * network" and leaves the user to find chain 61997 by hand has decided its own
 * convenience matters more than theirs.
 */

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, fn: (...a: never[]) => void) => void;
  removeListener?: (e: string, fn: (...a: never[]) => void) => void;
};

const eth = (): Eth | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { ethereum?: Eth }).ethereum ?? null);

export function WalletBadge() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasWallet, setHasWallet] = useState(false);

  // Read existing permission without prompting. `eth_accounts` returns what the
  // user has already granted; `eth_requestAccounts` would open the wallet on
  // page load, which is a popup nobody asked for.
  useEffect(() => {
    const p = eth();
    setHasWallet(!!p);
    if (!p) return;
    let live = true;
    (async () => {
      try {
        const [accts, cid] = await Promise.all([
          p.request({ method: "eth_accounts" }) as Promise<string[]>,
          p.request({ method: "eth_chainId" }) as Promise<string>,
        ]);
        if (!live) return;
        setAddress(accts?.[0] ?? null);
        setChainId(cid ?? null);
      } catch {
        /* a wallet that refuses to answer is the same as no wallet here */
      }
    })();

    const onAccounts = (...a: never[]) => setAddress((a[0] as string[])?.[0] ?? null);
    const onChain = (...a: never[]) => setChainId((a[0] as string) ?? null);
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    return () => {
      live = false;
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, []);

  /** Switch, and ADD the chain if the wallet has never seen it. 4902 is the
   *  "unrecognised chain" code; without the add path every first-time visitor
   *  hits a dead end. */
  const switchNetwork = useCallback(async () => {
    const p = eth();
    if (!p) return;
    setError("");
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }],
      });
    } catch (e) {
      const code = (e as { code?: number })?.code;
      if (code === 4902 || code === -32603) {
        try {
          await p.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
        } catch (add) {
          setError((add as Error)?.message?.slice(0, 90) ?? "Could not add the network");
        }
      } else if (code !== 4001) {
        setError((e as Error)?.message?.slice(0, 90) ?? "Could not switch network");
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const p = eth();
    if (!p) {
      window.open("https://metamask.io/download/", "_blank", "noreferrer");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const accts = (await p.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accts?.[0] ?? null);
      const cid = (await p.request({ method: "eth_chainId" })) as string;
      setChainId(cid);
      if (cid?.toLowerCase() !== CHAIN_HEX) await switchNetwork();
    } catch (e) {
      const code = (e as { code?: number })?.code;
      // 4001 is the user closing the dialog. That is an answer, not an error.
      if (code !== 4001) setError((e as Error)?.message?.slice(0, 90) ?? "Could not connect");
    } finally {
      setBusy(false);
    }
  }, [switchNetwork]);

  // Auto-switch the moment a connected wallet is seen on the wrong chain.
  useEffect(() => {
    if (address && chainId && chainId.toLowerCase() !== CHAIN_HEX) void switchNetwork();
  }, [address, chainId, switchNetwork]);

  const right = chainId?.toLowerCase() === CHAIN_HEX;
  const connected = !!address;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:inline-flex ${
          connected && !right
            ? "border-moderate-rule bg-moderate-wash text-moderate"
            : "border-rule text-ink-3"
        }`}
        title={
          connected && !right
            ? "Your wallet is on another network — switching to Studio Dev"
            : `GenLayer Studio Dev, chain ${CHAIN.id}`
        }
      >
        <span
          className={`size-1.5 rounded-full ${connected && !right ? "bg-moderate" : "bg-safe"}`}
          aria-hidden
        />
        {connected && !right ? "Wrong network" : "Studio Dev"}
        <span className="text-ink-4 tnum">#{CHAIN.id}</span>
      </span>

      {connected && !right && (
        <button
          type="button"
          onClick={switchNetwork}
          className="border-moderate-rule bg-moderate-wash text-moderate hover:bg-moderate/10 shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
        >
          Switch
        </button>
      )}

      <button
        type="button"
        onClick={connect}
        disabled={busy}
        title={error || (connected ? address ?? "" : hasWallet ? "Connect a wallet" : "Install MetaMask")}
        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
          connected
            ? "border-rule text-ink-2 hover:bg-wash bg-white"
            : "border-rule-2 hover:border-accent hover:text-accent bg-white"
        }`}
      >
        {busy
          ? "Connecting…"
          : connected
            ? `${address!.slice(0, 6)}…${address!.slice(-4)}`
            : hasWallet
              ? "Connect"
              : "Get a wallet"}
      </button>
    </div>
  );
}
