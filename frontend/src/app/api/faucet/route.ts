import { NextResponse } from "next/server";
import { CHAIN } from "@/lib/chain";

export const dynamic = "force-dynamic";

/**
 * The Studio faucet, proxied.
 *
 * Studio Dev funds an address through a `sim_fundAccount` JSON-RPC call rather
 * than a faucet website, so onboarding that just linked somewhere would be
 * linking to a page that does not exist. This makes the real call, from the
 * server, so the browser never has to know the RPC shape.
 */

const ONE_GEN = 10n ** 18n;
const GRANT = 100n * ONE_GEN;

export async function POST(request: Request) {
  let address = "";
  try {
    address = String(((await request.json()) as { address?: string })?.address ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, reason: "Send a JSON body with an address." }, { status: 400 });
  }

  // Checked here rather than passed through: a malformed address reaches the
  // node as a valid-looking JSON-RPC call and comes back as an opaque
  // infrastructure error that reads like an outage.
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { ok: false, reason: "That is not an Ethereum address. Connect a wallet first." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(CHAIN.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sim_fundAccount",
        params: [address, Number(GRANT)],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body?.error) {
      return NextResponse.json(
        { ok: false, reason: body.error.message ?? "The faucet refused that request." },
        { status: 502 },
      );
    }
    if (!body?.result) {
      return NextResponse.json(
        { ok: false, reason: "The faucet did not answer. Try again in a moment." },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      hash: body.result,
      amount: "100 GEN",
      explorer: `${CHAIN.explorer}/tx/${body.result}`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: `The faucet did not answer: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
