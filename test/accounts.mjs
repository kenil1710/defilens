/**
 * Creates test/.accounts.json — a stable, reusable pool of signing keys.
 *
 * A POOL rather than one key because DeFiLens' rules are RELATIONAL. The
 * per-wallet submission cooldown cannot even be STATED with a single address:
 * proving that wallet A is throttled while wallet B is not requires two
 * wallets. Same for owner-vs-stranger access control, and for the composability
 * demo where a DeFiConsumer contract is deployed by somebody other than the
 * DeFiLens owner.
 *
 * Keys are written by hand rather than read off `createAccount()`, because that
 * helper does NOT expose a `privateKey` field — it returns a viem account whose
 * key stays private to the closure. Persisting `account.privateKey` therefore
 * writes `undefined`, JSON.stringify drops the field entirely, and every later
 * `createAccount(undefined)` silently mints a brand-new random account. On a
 * faucet-funded network that failure is INVISIBLE: every run works, just from a
 * different address each time. It surfaces only later, as cooldown tests that
 * can never trigger and an owner nobody holds the key to.
 *
 * Existing roles are PRESERVED across runs unless --force is passed, so a
 * funded address is never silently replaced.
 *
 * Usage: node accounts.mjs [--force]
 */
import { createAccount } from "genlayer-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("./.accounts.json", import.meta.url);
const force = process.argv.includes("--force");

// `client` deploys and owns DeFiLens. `analystA` and `analystB` submit protocol
// analyses — two of them because the per-wallet cooldown makes a single analyst
// unable to submit twice in one run. `integrator` deploys and drives
// DeFiConsumer, which is the composability story: a contract that is NOT the
// oracle's owner reading its verdicts. `outsider` only ever probes access
// control — it must never be given a privilege by any test.
// SIX analysts, not two. The per-wallet rate limit is 300s, so a run that
// scores six protocols from two wallets spends most of its time being throttled
// — and the throttled calls come back as REJECTED, which reads exactly like a
// contract fault in a log. One wallet per protocol keeps the suite measuring
// what it meant to measure.
const ROLES = ["client", "analystA", "analystB", "analystC", "analystD",
               "analystE", "analystF", "integrator", "outsider"];

const existing = existsSync(target) && !force ? JSON.parse(readFileSync(target, "utf8")) : {};
const out = {};
let created = 0;

for (const role of ROLES) {
  if (existing[role]?.key) {
    out[role] = existing[role];
    continue;
  }
  const key = `0x${randomBytes(32).toString("hex")}`;
  const account = createAccount(key);
  // Round-trip assertion: the stored address must be the one this key actually
  // derives. Without it a mismatch just sits in the file looking plausible.
  if (createAccount(key).address !== account.address) {
    throw new Error(`key for ${role} does not derive a stable address`);
  }
  out[role] = { key, address: account.address };
  created++;
}

writeFileSync(target, JSON.stringify(out, null, 2) + "\n");

console.log(`wrote .accounts.json — ${created} new, ${ROLES.length - created} preserved`);
for (const role of ROLES) console.log(`  ${role.padEnd(12)} ${out[role].address}`);
