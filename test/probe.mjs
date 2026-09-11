/**
 * Deploys contracts/_render_probe.py to Studio Dev and asks it the four
 * questions DeFiLens is built on. Throwaway — its findings live in docs/PROBE.md
 * and nothing in the product depends on this file.
 *
 *   node probe.mjs                  # deploy + run everything
 *   node probe.mjs --at=0x…         # reuse an already-deployed probe
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, argOf, accounts, fundOnStudio, deploy, connect, retry, sleep } from "./harness.mjs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
const only = argOf("only", null);

const acc = accounts();
const account = createAccount(acc.client.key);
const wallet = createClient({ chain, account });
const read = createClient({ chain });

const LOG = new URL("../docs/probe-raw.json", import.meta.url);
const findings = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : { runs: [] };
const record = (name, data) => {
  findings.runs.push({ name, at: new Date().toISOString(), data });
  writeFileSync(LOG, JSON.stringify(findings, null, 2) + "\n");
};

console.log(`\nDeFiLens render probe → ${networkName}`);
await fundOnStudio(chain, account.address, 500n * 10n ** 18n);
const bal = await read.getBalance({ address: account.address });
console.log(`  signer     ${account.address}  (${(Number(bal) / 1e18).toFixed(2)} GEN)`);

let address = argOf("at", null);
if (!address) {
  const code = readFileSync(new URL("../contracts/_render_probe.py", import.meta.url));
  console.log(`  artifact   contracts/_render_probe.py (${code.length.toLocaleString()} bytes)`);
  const res = await deploy({ chain, wallet, read, code, args: [], label: "probe deploy" });
  if (!res.ok) {
    console.error(`\nProbe deploy FAILED: ${res.out?.status} ${res.reason ?? ""} ${res.out?.revertReason ?? ""}`);
    console.error(res.out?.stderr?.slice(0, 2000) ?? "");
    process.exit(1);
  }
  address = res.address;
  console.log(`  address    ${address}\n`);
  writeFileSync(new URL("./.probe.json", import.meta.url), JSON.stringify({ address, hash: res.hash }, null, 2) + "\n");
} else {
  console.log(`  address    ${address} (reused)\n`);
}

const { send, view } = connect({ networkName, address, role: "client" });

/** Reads a long stored string back in slices — a view return has a size ceiling. */
async function readAll(fn, sliceFn, max = 60000) {
  let out = "";
  for (let i = 0; i < max; i += 6000) {
    const chunk = await view(sliceFn, [i, 6000]);
    out += chunk;
    if (chunk.length < 6000) break;
  }
  return out;
}

async function step(name, fn, args) {
  if (only && !name.includes(only)) return null;
  process.stdout.write(`→ ${name} … `);
  const out = await send(fn, args);
  if (!out.ok) {
    console.log(`FAILED (${out.status}) ${out.revertReason || out.failure || ""}`);
    console.log((out.stderr || "").split("\n").slice(-6).join("\n"));
    record(name, { error: out.revertReason || out.failure, status: out.status });
    return null;
  }
  const raw = await readAll("get_statuses", "get_statuses_slice");
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { unparseable: raw.slice(0, 4000) }; }
  console.log(`ok (${out.seconds.toFixed(0)}s, ${raw.length} chars)`);
  console.log(JSON.stringify(parsed, null, 2).slice(0, 6000));
  console.log("");
  record(name, parsed);
  return parsed;
}

// ── Q1. Does validator egress reach api.llama.fi at all, and on which paths?
await step("statuses", "probe_statuses", [[
  "https://api.llama.fi/protocols",
  "https://api.llama.fi/protocol/aave",
  "https://api.llama.fi/protocol/gmx",
  "https://api.llama.fi/protocol/uniswap",
  "https://api.llama.fi/protocol/this-protocol-does-not-exist-xyz",
  "https://api.llama.fi/tvl/aave",
]]);

// ── Q2. THE SIZE WALL. api.llama.fi documents run 18 bytes to 29 MB. Where
// does a validator stop being able to fetch and parse one?
await step("size-ladder", "probe_size_ladder", [[
  "https://api.llama.fi/tvl/aave-v3",
  "https://api.llama.fi/v2/chains",
  "https://api.llama.fi/config/smol/appMetadata-protocols.json",
  "https://api.llama.fi/protocol/gmx",
  "https://api.llama.fi/lite/protocols2",
  "https://api.llama.fi/protocols",
  "https://api.llama.fi/protocol/aave-v3",
]]);

// ── Q3. Can a validator reduce the 6.7 MB lite list to ONE protocol's row?
await step("lite-row-aave", "probe_lite_row", ["https://api.llama.fi/lite/protocols2", "aave v3"]);
await step("lite-row-gmx", "probe_lite_row", ["https://api.llama.fi/lite/protocols2", "gmx v1"]);

// ── The /protocols list: how many rows, what shape, which categories.
await step("list-shape", "probe_list_shape", ["https://api.llama.fi/protocols"]);

// ── Q3. A single protocol's full schema.
await step("keys-aave", "probe_keys", ["https://api.llama.fi/protocol/aave"]);

// ── Q4. THE DESIGN PROBE: does the two-fetch resolution work on a child, on a
// parent, and on a slug that does not exist?
await step("resolve-aave", "probe_resolve", ["aave"]);
await step("resolve-aave-v3", "probe_resolve", ["aave-v3"]);
await step("resolve-gmx", "probe_resolve", ["gmx"]);
await step("resolve-uniswap", "probe_resolve", ["uniswap"]);
await step("resolve-compound", "probe_resolve", ["compound"]);
await step("resolve-missing", "probe_resolve", ["not-a-real-protocol-xyz"]);

// ── Are the five dimensions computable from one fetch?
await step("extract-aave", "probe_extract", ["https://api.llama.fi/protocol/aave"]);
await step("extract-gmx", "probe_extract", ["https://api.llama.fi/protocol/gmx"]);
await step("extract-uniswap", "probe_extract", ["https://api.llama.fi/protocol/uniswap"]);

console.log(`\nRaw findings appended to docs/probe-raw.json`);
console.log(`Probe contract: ${address}`);
console.log(`Explorer: https://explorer-studio-dev.genlayer.com/\n`);
