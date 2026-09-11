/**
 * Deploys DeFiLens (and optionally DeFiConsumer) to Studio Dev.
 *
 *   node deploy.mjs                      # DeFiLens only
 *   node deploy.mjs --consumer           # DeFiLens, then a consumer wired to it
 *   node deploy.mjs --consumer --at=0x…  # a consumer against an existing oracle
 *
 * Every deploy and every write estimates its fee first. Studio Dev prices
 * transactions and refuses one whose attached feeValue is below the floor;
 * estimating per-call rather than hardcoding a number is the difference between
 * a script that keeps working when the fee policy moves and one that starts
 * failing everywhere for a reason that looks like a contract bug.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, argOf, accounts, fundOnStudio, deploy, retry, gen } from "./harness.mjs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
if (!chain) throw new Error(`unknown network ${networkName}`);

const withConsumer = process.argv.includes("--consumer");
const existingOracle = argOf("at", null);
const feeWei = BigInt(argOf("fee", "0"));
const minScore = Number(argOf("min-score", "55"));
const maxAge = Number(argOf("max-age", String(7 * 24 * 3600)));

const acc = accounts();
const signerRole = argOf("as", "client");
const account = createAccount(acc[signerRole].key);
const wallet = createClient({ chain, account });
const read = createClient({ chain });

console.log(`\nDeFiLens deploy → ${networkName}`);
console.log(`  signer     ${account.address} (${signerRole})`);

await fundOnStudio(chain, account.address, 500n * 10n ** 18n);
const balance = await read.getBalance({ address: account.address });
console.log(`  balance    ${gen(balance)} GEN`);

const path = new URL("../deployments.json", import.meta.url);
const doc = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
doc.deployments = doc.deployments || {};
const record = doc.deployments[networkName] || { network: networkName, chain_id: chain.id };

/**
 * Persist AFTER EACH CONTRACT, not once at the end.
 *
 * The first run of this script deployed DeFiLens successfully, then exited on a
 * DeFiConsumer failure before it had written anything — so a contract that was
 * live on chain existed nowhere on disk, and the next run happily skipped it.
 * A deploy record that only survives a fully clean run is a deploy record that
 * loses exactly the addresses you most need after a partial failure.
 */
function persist() {
  record.explorer = "https://explorer-studio-dev.genlayer.com/";
  doc.deployments[networkName] = record;
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
}

let oracle = existingOracle;

if (!existingOracle) {
  const code = readFileSync(new URL("../contracts/DeFiLens.py", import.meta.url));
  console.log(`\n  DeFiLens   contracts/DeFiLens.py (${code.length.toLocaleString()} bytes)`);
  console.log(`  fee_wei    ${feeWei}`);
  const res = await deploy({ chain, wallet, read, code, args: [Number(feeWei)], label: "DeFiLens deploy" });
  if (!res.ok) {
    console.error(`\nDeFiLens deploy FAILED: ${res.out?.status} ${res.reason ?? ""} ${res.out?.revertReason ?? ""}`);
    console.error((res.out?.stderr ?? "").split("\n").slice(-25).join("\n"));
    process.exit(1);
  }
  oracle = res.address;
  console.log(`  address    ${oracle}`);

  // Prove it ANSWERS before recording it. A deploy that lands but cannot be
  // read is not a deploy anyone can use, and recording it would publish a dead
  // link for the frontend to fail against.
  const cfg = await retry(() => read.readContract({ address: oracle, functionName: "get_config", args: [] }), { label: "get_config" });
  const stats = await retry(() => read.readContract({ address: oracle, functionName: "get_stats", args: [] }), { label: "get_stats" });
  console.log(`  owner      ${cfg.owner}`);
  console.log(`  rubric     v${cfg.rubric_version}   weights ${JSON.stringify(cfg.weights)}`);
  console.log(`  verdicts   ${cfg.verdicts.join(" / ")}   thresholds ${JSON.stringify(cfg.thresholds)}`);
  console.log(`  tracked    ${stats.protocols_tracked} protocols`);

  record.DeFiLens = {
    address: oracle,
    deploy_tx: res.hash,
    source_bytes: code.length,
    owner: cfg.owner,
    rubric_version: cfg.rubric_version,
    fee_wei: String(cfg.fee_wei),
    deployed_at: new Date().toISOString(),
  };
  persist();
  console.log(`  recorded   deployments.json`);
} else {
  console.log(`\n  DeFiLens   ${oracle} (reused)`);
  if (!record.DeFiLens?.address) {
    record.DeFiLens = { ...(record.DeFiLens || {}), address: oracle, note: "adopted via --at" };
    persist();
  }
}

if (withConsumer) {
  const code = readFileSync(new URL("../contracts/DeFiConsumer.py", import.meta.url));
  console.log(`\n  Consumer   contracts/DeFiConsumer.py (${code.length.toLocaleString()} bytes)`);
  console.log(`  oracle     ${oracle}`);
  console.log(`  policy     min_score=${minScore} max_age=${maxAge}s`);
  const res = await deploy({
    chain, wallet, read, code,
    args: [oracle, minScore, maxAge],
    label: "DeFiConsumer deploy",
  });
  if (!res.ok) {
    console.error(`\nDeFiConsumer deploy FAILED: ${res.out?.status} ${res.reason ?? ""} ${res.out?.revertReason ?? ""}`);
    console.error((res.out?.stderr ?? "").split("\n").slice(-25).join("\n"));
    process.exit(1);
  }
  console.log(`  address    ${res.address}`);
  const cfg = await retry(() => read.readContract({ address: res.address, functionName: "get_config", args: [] }), { label: "consumer get_config" });
  console.log(`  wired to   ${cfg.oracle}`);
  if (String(cfg.oracle).toLowerCase() !== String(oracle).toLowerCase()) {
    console.error(`\nConsumer points at ${cfg.oracle}, not ${oracle} — refusing to record it`);
    process.exit(1);
  }
  record.DeFiConsumer = {
    address: res.address,
    deploy_tx: res.hash,
    source_bytes: code.length,
    oracle,
    min_score: Number(cfg.min_score),
    max_assessment_age_s: Number(cfg.max_assessment_age_s),
    deployed_at: new Date().toISOString(),
  };
  persist();
}

persist();
console.log(`\n✔ recorded in deployments.json`);
console.log(`  explorer   https://explorer-studio-dev.genlayer.com/\n`);
