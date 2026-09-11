import { createClient, createAccount } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

/**
 * One place that knows where the oracle lives.
 *
 * The addresses are baked in as defaults rather than left as required env vars:
 * a deployed site whose only copy of the contract address is an environment
 * variable somebody forgot to set is a site that renders an error page, and the
 * address is public information anyway.
 */
export const ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_ORACLE_ADDRESS ??
  "0x0A87bbebEA59ae55a43c6e721213d4CCF672d1Bc") as `0x${string}`;

export const CONSUMER_ADDRESS = (process.env.NEXT_PUBLIC_CONSUMER_ADDRESS ??
  "0x77DAF72BbaA65f3613D503b21BDb4A2C0858b1B1") as `0x${string}`;

export const EXPLORER = "https://explorer-studio-dev.genlayer.com";
export const CHAIN = studioDevnet;
export const LLAMA = "https://api.llama.fi";

export const readClient = () => createClient({ chain: studioDevnet });

/**
 * The relayer.
 *
 * Studio Dev is a faucet-funded testnet and analysis is free, so the site
 * submits on a visitor's behalf rather than demanding they install a wallet and
 * fund it to try a free read-only product. The key is server-side only and is
 * never sent to the browser; the UI says plainly that it is a testnet relayer.
 */
export function relayClient() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) return null;
  const account = createAccount(key as `0x${string}`);
  return { wallet: createClient({ chain: studioDevnet, account }), account };
}

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
export const llamaUrl = (slug: string) => `https://defillama.com/protocol/${slug}`;

/** Retry an RPC call. Studio meters 30 requests a minute and intermittently
 *  answers with an HTML error page, which surfaces as `Unexpected token '<'`. */
export async function retry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String((e as Error)?.message ?? e);
      const transient =
        /Unexpected token '<'|not valid JSON|fetch failed|ECONNRESET|ETIMEDOUT|50\d|rate limit exceeded|-32029/i.test(msg);
      if (!transient || i === attempts) throw e;
      await new Promise((r) => setTimeout(r, /rate limit/i.test(msg) ? 4000 : 900 * i));
    }
  }
  throw last;
}
