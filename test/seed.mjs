/**
 * Scores a spread of real protocols on the live deployment, so the oracle has
 * something worth looking at and the frontend has real data behind it.
 *
 *   node seed.mjs
 *   node seed.mjs --protocols=a,b,c
 *
 * The default list is chosen for CONTRAST, not for flattery: blue-chip lenders
 * and DEXes next to a bridge, a young single-chain farm and a protocol well off
 * its peak — because an oracle where everything scores SAFE is an oracle that
 * measures nothing.
 *
 * One wallet per protocol, cycled: the per-wallet rate limit is 300s and a run
 * that reuses a signer inside it spends its time being throttled.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { CHAINS, argOf, accounts, connect, fundOnStudio, sleep } from "./harness.mjs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
const deployments = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"));
const ORACLE = argOf("at", deployments.deployments[networkName]?.DeFiLens?.address);
if (!ORACLE) throw new Error("no DeFiLens address — run deploy.mjs first");

const DEFAULT = [
  "aave-v3",          // Lending, blue chip, many chains
  "uniswap-v3",       // Dexs, blue chip
  "lido",             // Liquid Staking, the safest category
  "compound-v3",      // Lending
  "curve-dex",        // Dexs, mature but well off peak
  "makerdao",         // CDP
  "pendle",           // Yield
  "gmx",              // Derivatives — the brief's high-risk anchor
  "stargate",         // a young single-chain farm
  "across",           // Bridge — the brief's other high-risk anchor
  "rocket-pool",      // Liquid Staking
  "eigenlayer",       // Restaking
];
const TARGETS = (argOf("protocols", DEFAULT.join(",")) || "").split(",").map((s) => s.trim()).filter(Boolean);

const ANALYSTS = ["analystA", "analystB", "analystC", "analystD", "analystE", "analystF"];
const acc = accounts();
for (const role of ANALYSTS) await fundOnStudio(chain, acc[role].address, 500n * 10n ** 18n);
const signers = ANALYSTS.map((role) => connect({ networkName, address: ORACLE, role }));
const reader = signers[0];

console.log(`\nSeeding ${TARGETS.length} protocols into ${ORACLE}\n`);
const results = [];
for (let i = 0; i < TARGETS.length; i++) {
  const slug = TARGETS[i];
  const signer = signers[i % signers.length];
  // Once every wallet has been used, the first one is inside its 300s window.
  if (i >= signers.length && i % signers.length === 0) {
    console.log(`  … all ${signers.length} wallets used; waiting out the 300s rate limit`);
    await sleep(305_000);
  }
  process.stdout.write(`  ${String(i + 1).padStart(2)}. ${slug.padEnd(16)} `);
  const r = await signer.send("analyze_protocol", [slug], 0n);
  if (!r.ok) {
    console.log(`FAILED ${r.status} ${String(r.revertReason || r.failure).slice(0, 90)}`);
    results.push({ slug, ok: false, status: r.status, reason: String(r.revertReason || r.failure).slice(0, 200), hash: r.hash });
    continue;
  }
  const body = r.returnReadable ? r.returned : null;
  if (body && typeof body === "object" && body.status === "REJECTED") {
    console.log(`refused — ${String(body.reason).slice(0, 90)}`);
    results.push({ slug, ok: false, status: "REJECTED", reason: String(body.reason).slice(0, 200), hash: r.hash });
    continue;
  }
  /*
   * The return VALUE is not always readable — `consensus_data` is where it
   * lives and it is not always populated — so the record is read back from
   * storage when it is missing. Patiently: a view fired immediately after a
   * write can hit the RPC's per-minute bucket, and swallowing that with
   * `.catch(() => null)` turned a whole seeding run into a wall of "?" for
   * assessments that had in fact landed perfectly.
   */
  let rec = body;
  for (let attempt = 0; !rec && attempt < 4; attempt++) {
    await sleep(1500 * (attempt + 1));
    rec = await reader.view("get_assessment_by_slug", [slug]).catch(() => null);
    if (rec && rec.found === false) rec = null;
  }
  console.log(`${String(rec?.verdict ?? "?").padEnd(9)} ${String(rec?.overall_score ?? "?").padStart(3)}/100  ` +
    `tvl $${Number(rec?.tvl_usd ?? 0).toLocaleString()}  ${rec?.chain_count ?? "?"} chains  ${rec?.category ?? "?"}  (${Math.round(r.seconds)}s)`);
  results.push({
    slug, ok: true, hash: r.hash, seconds: Math.round(r.seconds),
    assessment_id: rec?.assessment_id, verdict: rec?.verdict, score: rec?.overall_score,
    category: rec?.category, tvl_usd: rec?.tvl_usd, chain_count: rec?.chain_count,
    content_hash: rec?.content_hash,
    explorer: `https://explorer-studio-dev.genlayer.com/tx/${r.hash}`,
  });
  await sleep(1500);
}

const stats = await reader.view("get_stats");
const top = await reader.view("get_top_protocols", [20]);
const risk = await reader.view("get_riskiest", [20]);
console.log(`\n  tracked ${stats.protocols_tracked} · analysed ${stats.total_analyzed} · verdicts ${JSON.stringify(stats.verdicts)}`);
console.log(`  safest:   ${top.protocols.slice(0, 3).map((p) => `${p.slug} ${p.overall_score}`).join(", ")}`);
console.log(`  riskiest: ${risk.protocols.slice(0, 3).map((p) => `${p.slug} ${p.overall_score}`).join(", ")}`);

const path = new URL("../docs/seed-results.json", import.meta.url);
const prior = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { runs: [] };
prior.runs = prior.runs || [];
prior.runs.push({ at: new Date().toISOString(), oracle: ORACLE, network: networkName, results, stats });
prior.latest = { oracle: ORACLE, at: new Date().toISOString(), results, stats };
writeFileSync(path, JSON.stringify(prior, null, 2) + "\n");
console.log(`\n✔ docs/seed-results.json\n`);
