/**
 * Reads the LIVE deployment and writes docs/evidence.json — the record of what
 * is actually on chain, rather than of what a run intended to put there.
 *
 * Separate from seed.mjs on purpose: a seeding run can have a bad minute on the
 * RPC and report "?" for assessments that landed perfectly, and the evidence a
 * reviewer reads should come from the chain, not from a log.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "genlayer-js";
import { CHAINS, argOf, connect, retry } from "./harness.mjs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
const deployments = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"));
const dep = deployments.deployments[networkName];
const ORACLE = argOf("at", dep?.DeFiLens?.address);
const CONSUMER = dep?.DeFiConsumer?.address;
const read = createClient({ chain });
const c = connect({ networkName, address: ORACLE, role: "client" });

const cfg = await c.view("get_config");
const stats = await c.view("get_stats");
const list = await c.view("get_protocols", [0, 100]);
const top = await c.view("get_top_protocols", [20]);
const risk = await c.view("get_riskiest", [20]);
const recent = await c.view("get_recent", [20]);

const assessments = {};
const verifications = {};
for (const p of list.protocols) {
  const rec = await retry(() => c.view("get_assessment_by_slug", [p.slug]), { label: p.slug });
  assessments[p.slug] = rec;
  if (rec?.assessment_id !== undefined) {
    verifications[p.slug] = await retry(() => c.view("verify_assessment", [rec.assessment_id]), { label: `verify ${p.slug}` })
      .catch((e) => ({ verified: false, error: String(e).slice(0, 200) }));
  }
}

let consumer = null;
if (CONSUMER) {
  const cc = connect({ networkName, address: CONSUMER, role: "integrator" });
  consumer = {
    address: CONSUMER,
    config: await cc.view("get_config"),
    stats: await cc.view("get_stats"),
    decisions: await cc.view("get_decisions"),
    refusals: await cc.view("get_refusals", [10]),
    // The custody claim, read off the chain rather than off the source: a
    // contract with no payable method has nothing to strand, and its balance
    // says so without anyone having to take the README's word for it.
    balance_wei: String(await read.getBalance({ address: CONSUMER }).catch(() => "unknown")),
    checks: {},
  };
  for (const p of list.protocols.slice(0, 6)) {
    consumer.checks[p.slug] = await cc.view("check", [p.slug]).catch((e) => ({ error: String(e).slice(0, 150) }));
  }
  consumer.checks["definitely-not-analysed"] = await cc.view("check", ["definitely-not-analysed"]).catch(() => null);
}

const verified = Object.values(verifications).filter((v) => v?.verified === true).length;
const out = {
  read_at: new Date().toISOString(),
  network: networkName,
  chain_id: chain.id,
  explorer: "https://explorer-studio-dev.genlayer.com/",
  oracle: ORACLE,
  consumer: CONSUMER,
  config: cfg,
  stats,
  protocols: list.protocols,
  safest: top.protocols,
  riskiest: risk.protocols,
  recent: recent.assessments,
  assessments,
  verifications,
  verification_summary: { verified, of: Object.keys(verifications).length },
  consumer_state: consumer,
};
writeFileSync(new URL("../docs/evidence.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");

console.log(`\nDeFiLens live state → ${ORACLE}`);
console.log(`  tracked ${stats.protocols_tracked} · analysed ${stats.total_analyzed} · refused ${stats.total_rejected}`);
console.log(`  verdicts ${JSON.stringify(stats.verdicts)}`);
console.log(`  verify_assessment: ${verified}/${Object.keys(verifications).length} records recompute exactly`);
for (const p of list.protocols) {
  const v = verifications[p.slug]?.verified ? "✔" : "✘";
  console.log(`   ${v} ${p.slug.padEnd(14)} ${String(p.verdict).padEnd(9)} ${String(p.overall_score).padStart(3)}/100  $${Number(p.tvl_usd).toLocaleString().padStart(16)}  ${p.category}`);
}
console.log(`\n✔ docs/evidence.json\n`);
