import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  ORACLE_ADDRESS, CHAIN, relayClient, readClient, retry, txUrl,
} from "@/lib/genlayer";
import { transactionsStatusNumberToName } from "genlayer-js/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Submit an analysis on the visitor's behalf.
 *
 * Studio Dev is faucet-funded and analysis is free, so asking every visitor to
 * install a wallet and fund it before they can try a read-only product would be
 * a tax on curiosity for no security benefit. The relayer key is server-side
 * only; the page says plainly that submissions come from a shared testnet
 * wallet.
 *
 * The shared wallet has consequences and the UI reports them honestly: one
 * analysis per 300 seconds across everybody, because the contract rate-limits
 * per wallet and that is the right thing for it to do.
 */
export async function POST(request: Request) {
  const relay = relayClient();
  if (!relay) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "This deployment has no relayer wallet configured, so it can read ratings but not request new ones.",
      },
      { status: 503 },
    );
  }

  let slug = "";
  try {
    const body = (await request.json()) as { slug?: string };
    slug = String(body?.slug ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, reason: "send a JSON body with a slug" }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ ok: false, reason: "name a protocol first" }, { status: 400 });
  }
  if (slug.length > 120) {
    return NextResponse.json({ ok: false, reason: "that name is too long to be a slug" }, { status: 400 });
  }

  const read = readClient();
  try {
    await fundRelayer(relay.account.address);

    /*
     * Estimate the fee by SIMULATING this exact call.
     *
     * A generic estimate produces no `messageAllocations`, and any method that
     * can post an internal message — which includes this one, via the refund
     * path — is then accepted by the node and fails inside it with
     * `fee no_matching_allocation`. Simulating with the real arguments returns
     * an allocation naming the real recipient.
     */
    let fees: {
      distribution: unknown;
      messageAllocations?: unknown;
      feeValue: unknown;
    } | undefined;
    try {
      const est = await retry(() =>
        relay.wallet.estimateTransactionFeesForWrite({
          address: ORACLE_ADDRESS, functionName: "analyze_protocol", args: [slug], value: 0n,
        }),
      );
      if (est?.distribution) {
        fees = {
          distribution: est.distribution,
          ...(est.messageAllocations ? { messageAllocations: est.messageAllocations } : {}),
          feeValue: est.feeValue,
        };
      }
    } catch {
      const est = await retry(() => relay.wallet.estimateTransactionFees()).catch(() => null);
      if (est?.distribution) {
        fees = { distribution: est.distribution, feeValue: est.feeValue };
      }
    }

    const hash = await retry(() =>
      relay.wallet.writeContract({
        address: ORACLE_ADDRESS,
        functionName: "analyze_protocol",
        args: [slug],
        value: 0n,
        ...(fees ? { fees: fees as never } : {}),
      }),
    );

    const started = Date.now();
    const TERMINAL = ["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"];
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      let tx: Record<string, unknown> | null = null;
      try {
        tx = (await retry(() => read.getTransaction({ hash }), 3)) as Record<string, unknown>;
      } catch {
        /* a poll the RPC could not answer is not an outcome — keep waiting */
      }
      const statusKey = String((tx as { status?: number } | null)?.status ?? "");
      const status = (transactionsStatusNumberToName as Record<string, string>)[statusKey];
      if (status && TERMINAL.includes(status)) {
        const receipt = (tx as { consensus_data?: { leader_receipt?: unknown[] } })
          ?.consensus_data?.leader_receipt?.[0] as
          | { execution_result?: string; result?: { status?: string; payload?: unknown } }
          | undefined;
        const reverted =
          receipt?.execution_result === "ERROR" || receipt?.result?.status === "rollback";
        const returned = decodeReturn(receipt?.result?.payload);

        revalidatePath("/", "layout");

        if (status === "UNDETERMINED") {
          return NextResponse.json({
            ok: false, hash, explorer: txUrl(hash), status,
            reason:
              "The validators did not converge on this protocol just now — DeFi Llama's numbers moved mid-round. Nothing was stored; try again in a moment.",
          });
        }
        if (reverted) {
          return NextResponse.json({
            ok: false, hash, explorer: txUrl(hash), status,
            reason: String(receipt?.result?.payload ?? "the call reverted"),
          });
        }
        if (returned && typeof returned === "object" && (returned as { status?: string }).status === "REJECTED") {
          return NextResponse.json({
            ok: false, rejected: true, hash, explorer: txUrl(hash), status,
            result: returned,
            reason: String((returned as { reason?: string }).reason ?? "refused"),
          });
        }
        return NextResponse.json({
          ok: true, hash, explorer: txUrl(hash), status,
          seconds: Math.round((Date.now() - started) / 1000),
          result: returned,
          slug,
        });
      }
      if (Date.now() - started > 240_000) {
        return NextResponse.json({
          ok: false, hash, explorer: txUrl(hash),
          reason:
            "The transaction was submitted but had not settled after four minutes. It may still land — check the explorer.",
        });
      }
    }
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    return NextResponse.json(
      { ok: false, reason: friendly(message) },
      { status: 502 },
    );
  }
}

function decodeReturn(payload: unknown): unknown {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === "string") return payload;
  const readable = (payload as { readable?: string })?.readable;
  if (typeof readable === "string") {
    try {
      return JSON.parse(readable);
    } catch {
      return readable;
    }
  }
  return null;
}

function friendly(message: string): string {
  if (/rate limit exceeded|-32029/i.test(message)) {
    return "GenLayer Studio is rate limiting requests right now. Give it a minute.";
  }
  if (/insufficient|balance/i.test(message)) {
    return "The shared testnet wallet is out of funds. Ratings already stored are still readable.";
  }
  if (/Unexpected token '<'|not valid JSON/i.test(message)) {
    return "GenLayer Studio answered with an error page instead of JSON. That is usually brief.";
  }
  return `The oracle could not be reached: ${message.slice(0, 200)}`;
}

/** Top the shared wallet up from the Studio faucet. Harmless if it is already
 *  funded, and it means the site does not quietly stop working when it runs dry. */
async function fundRelayer(address: string) {
  try {
    await fetch(CHAIN.rpcUrls.default.http[0], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "sim_fundAccount",
        params: [address, Number(500n * 10n ** 18n)],
      }),
    });
  } catch {
    /* the faucet being unavailable is not a reason to refuse the submission */
  }
}
