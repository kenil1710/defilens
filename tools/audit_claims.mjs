/**
 * Claims vs reality.
 *
 * Every number this repository asserts about itself, checked against the thing
 * it asserts it about. A README that is merely out of date reads, to a
 * reviewer, exactly like a README that was never true.
 *
 *   node tools/audit_claims.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

const ROOT = new URL("..", import.meta.url).pathname;
let pass = 0, fail = 0;
const G = "\x1b[32m", R = "\x1b[31m", B = "\x1b[1m", X = "\x1b[0m";
const ok = (m) => { pass++; console.log(`  ${G}✔${X} ${m}`); };
const bad = (m, d) => { fail++; console.log(`  ${R}✘${X} ${m}`); if (d) console.log(`      ${d}`); };
const head = (m) => console.log(`\n${B}${m}${X}`);

const readme = readFileSync(ROOT + "README.md", "utf8");
const deployments = JSON.parse(readFileSync(ROOT + "deployments.json", "utf8"));
const dep = deployments.deployments.studiodev;

console.log(`\n${B}DeFiLens claims audit${X}`);

/* ────────────────────────────────────────────── addresses agree */
head("1. Addresses");
for (const [name, addr] of [["DeFiLens", dep.DeFiLens.address], ["DeFiConsumer", dep.DeFiConsumer.address]]) {
  readme.includes(addr)
    ? ok(`README quotes the deployed ${name} address`)
    : bad(`README does not quote the deployed ${name} address (${addr})`);
}
const feAddrs = readFileSync(ROOT + "frontend/src/lib/genlayer.ts", "utf8");
feAddrs.includes(dep.DeFiLens.address)
  ? ok("frontend default oracle address matches deployments.json")
  : bad("frontend oracle address differs from deployments.json");
feAddrs.includes(dep.DeFiConsumer.address)
  ? ok("frontend default consumer address matches deployments.json")
  : bad("frontend consumer address differs from deployments.json");
String(dep.chain_id) === "61997"
  ? ok("deployments.json records chain 61997 (studio-dev)")
  : bad(`deployments.json records chain ${dep.chain_id}, expected 61997`);

/* ────────────────────────────────────────── test and audit counts */
head("2. Test and audit counts");
const testSrc = readFileSync(ROOT + "test/test_logic.py", "utf8");
const realTests = (testSrc.match(/def test_\w+/g) || []).length;
const claimedTests = [...readme.matchAll(/(\d+)\s+(?:offline\s+)?tests/gi)].map((m) => Number(m[1]));
claimedTests.length && claimedTests.every((n) => n === realTests)
  ? ok(`README's test count (${realTests}) matches test_logic.py`)
  : bad(`README claims ${claimedTests.join("/")} tests; the file defines ${realTests}`);

const auditOut = execSync("bash tools/audit.sh 2>&1 || true", { cwd: ROOT, encoding: "utf8" });
const m = auditOut.match(/(\d+) passed, (\d+) failed/);
const realChecks = m ? Number(m[1]) : -1;
const realFails = m ? Number(m[2]) : -1;
// Anchored to the audit it describes: the README also mentions the site audit,
// whose total legitimately moves with the number of routes.
const claimedChecks = [...readme.matchAll(/(\d+) checks[^\n]*?tools\/audit\.sh/gi)]
  .concat([...readme.matchAll(/(\d+) mechanical checks/gi)])
  .map((x) => Number(x[1]));
claimedChecks.length && claimedChecks.every((n) => n === realChecks)
  ? ok(`README's audit count (${realChecks} checks) matches tools/audit.sh`)
  : bad(`README claims ${claimedChecks.join("/")} checks; audit.sh runs ${realChecks}`);
realFails === 0 ? ok("tools/audit.sh reports zero failures") : bad(`tools/audit.sh has ${realFails} failing checks`);

/* ───────────────────────────────────────── line counts in the layout */
head("3. Source line counts");
for (const [file, label] of [["contracts/DeFiLens.py", "DeFiLens.py"], ["contracts/DeFiConsumer.py", "DeFiConsumer.py"]]) {
  const lines = readFileSync(ROOT + file, "utf8").split("\n").length - 1;
  const claimed = readme.match(new RegExp(`${label.replace(".", "\\.")}[^\\n]*?([\\d,]+) lines`));
  if (!claimed) { ok(`${label}: no line count claimed`); continue; }
  const n = Number(claimed[1].replace(/,/g, ""));
  n === lines ? ok(`${label} is ${lines} lines, as claimed`)
              : bad(`README says ${label} is ${n} lines; it is ${lines}`);
}

/* ──────────────────────────────────────── live chain state matches */
head("4. Live chain state");
const client = createClient({ chain: studioDevnet });

/**
 * Studio meters THIRTY reads a minute per caller, and verifying every stored
 * record is one read each. Unpaced, this audit reports "could not read the
 * oracle" on a healthy chain — a checker whose own failure mode looks like the
 * product failing is worse than no checker.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function read(fn, args = []) {
  const gap = Date.now() - lastCall;
  if (gap < 2100) await sleep(2100 - gap);
  for (let attempt = 1; ; attempt++) {
    try {
      lastCall = Date.now();
      return await client.readContract({ address: dep.DeFiLens.address, functionName: fn, args });
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (!/rate limit|Unexpected token '<'|fetch failed|50\d/i.test(msg) || attempt >= 5) throw e;
      await sleep(/rate limit/i.test(msg) ? 20_000 : 2_000 * attempt);
    }
  }
}

try {
  const stats = await read("get_stats");
  ok(`oracle answers: ${stats.protocols_tracked} protocols, ${stats.total_analyzed} assessments, average ${stats.average_score}`);

  // Every verify_assessment claim in the README, checked against the chain.
  const claim = readme.match(/\*\*(\d+) of (\d+) stored records recompute exactly\*\*/);
  const { protocols } = await read("get_protocols", [0, 100]);
  let verified = 0, checked = 0;
  for (const p of protocols) {
    const v = await read("verify_assessment", [p.assessment_id]);
    checked++;
    if (v?.verified) verified++;
    else bad(`assessment #${p.assessment_id} (${p.slug}) does NOT recompute`, (v?.differences || []).join("; "));
  }
  verified === checked
    ? ok(`${verified}/${checked} stored records recompute exactly on chain`)
    : bad(`${verified}/${checked} recompute`);
  if (claim) {
    Number(claim[1]) === verified && Number(claim[2]) === checked
      ? ok(`README's "${claim[1]} of ${claim[2]}" matches the chain`)
      : bad(`README claims ${claim[1]} of ${claim[2]}; the chain has ${verified} of ${checked}`);
  }

  // Any protocol score quoted in the README must match the chain.
  const bySlug = Object.fromEntries(protocols.map((p) => [p.slug, p]));
  let quoted = 0;
  for (const mm of readme.matchAll(/`?([a-z0-9][a-z0-9-]{2,30})`?\s+(?:is\s+)?(?:rated|scores?)\s+(\d{1,3})\/100/gi)) {
    const [, slug, score] = mm;
    if (!bySlug[slug]) continue;
    quoted++;
    Number(score) === Number(bySlug[slug].overall_score)
      ? ok(`README's ${slug} = ${score}/100 matches the chain`)
      : bad(`README says ${slug} scores ${score}; the chain says ${bySlug[slug].overall_score}`);
  }
  if (quoted === 0) ok("README quotes no per-protocol score that could drift");
} catch (e) {
  bad("could not read the oracle", e.message);
}

/* ───────────────────────────────────────── every link resolves */
head("5. Links in the README");
// localhost appears in the README as an EXAMPLE command, not as a claim about
// something that should be reachable from anywhere.
const urls = [...new Set([...readme.matchAll(/https?:\/\/[^\s)\]<>"']+/g)]
  .map((x) => x[0].replace(/[.,]$/, ""))
  .filter((u) => !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)))];
for (const u of urls) {
  try {
    const res = await fetch(u, { redirect: "follow" });
    res.ok ? ok(`${res.status} ${u}`) : bad(`${res.status} ${u}`);
  } catch (e) { bad(`unreachable ${u}`, e.message); }
}

console.log(`\n${B}${pass} passed, ${fail} failed${X}\n`);
process.exit(fail ? 1 : 0);
