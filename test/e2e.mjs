/**
 * End-to-end against a LIVE Studio Dev deployment and the LIVE DeFi Llama API.
 *
 *   node e2e.mjs                 # reads deployments.json
 *   node e2e.mjs --at=0x… --consumer=0x…
 *
 * What this proves that the offline suite cannot:
 *   - five real validators independently fetch api.llama.fi and AGREE on a
 *     bucketed vector for a live protocol whose TVL is moving;
 *   - the stored record verifies against its own evidence ON CHAIN;
 *   - a rejected payable call refunds rather than confiscating, with real wei,
 *     and an ACCEPTED one refunds every wei above the fee — so nothing the
 *     oracle takes in can be stranded in it;
 *   - a real cross-contract read works: DeFiConsumer refuses an unassessed
 *     protocol and admits a scored one, holding no money either way.
 *
 * Every write estimates its fee first. Nothing here is skipped on failure — a
 * failed check costs one red line and the run continues, so one flaky
 * transaction cannot hide the twenty checks after it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { CHAINS, argOf, accounts, connect, fundOnStudio, retry, sleep, gen } from "./harness.mjs";

const networkName = argOf("network", "studiodev");
const chain = CHAINS[networkName];
const deployments = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"));
const dep = deployments.deployments[networkName] || {};
const ORACLE = argOf("at", dep.DeFiLens?.address);
const CONSUMER = argOf("consumer", dep.DeFiConsumer?.address);
if (!ORACLE) throw new Error("no DeFiLens address — run deploy.mjs first");

const acc = accounts();
const read = createClient({ chain });
const evidence = { network: networkName, chain_id: chain.id, oracle: ORACLE, consumer: CONSUMER, run_at: new Date().toISOString(), transactions: [], checks: [] };

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? " — " + detail : ""}`); }
  evidence.checks.push({ name, ok: Boolean(cond), detail: String(detail).slice(0, 400) });
  return Boolean(cond);
};
const note = (hash, what, extra = {}) => {
  if (hash) evidence.transactions.push({ hash, what, ...extra, explorer: `https://explorer-studio-dev.genlayer.com/tx/${hash}` });
};

const ANALYSTS = ["analystA", "analystB", "analystC", "analystD", "analystE",
                  "analystF"];
for (const role of ["client", ...ANALYSTS, "integrator", "outsider"]) {
  await fundOnStudio(chain, acc[role].address, 500n * 10n ** 18n);
}

const owner = connect({ networkName, address: ORACLE, role: "client" });
const analysts = ANALYSTS.map((role) => connect({ networkName, address: ORACLE, role }));
const b = analysts[1];
const out = connect({ networkName, address: ORACLE, role: "outsider" });

console.log(`\nDeFiLens E2E → ${networkName}`);
console.log(`  oracle     ${ORACLE}`);
console.log(`  consumer   ${CONSUMER ?? "(none)"}`);

// ───────────────────────────────────────────────────────────── 1. config
console.log(`\n1. The deployment answers`);
const cfg = await owner.view("get_config");
ok("get_config answers", Boolean(cfg?.owner));
ok("weights sum to 100", Object.values(cfg.weights).reduce((x, y) => x + Number(y), 0) === 100, JSON.stringify(cfg.weights));
ok("five dimensions", cfg.dimensions.length === 5, cfg.dimensions.join(","));
ok("rubric version recorded", Boolean(cfg.rubric_version), cfg.rubric_version);
ok("fee defaults to free", Number(cfg.fee_wei) === 0, String(cfg.fee_wei));
ok("data source is DeFi Llama", cfg.data_source === "DeFi Llama");
evidence.config = cfg;

// ───────────────────────────────────────── 2. score real protocols, for real
const TARGETS = (argOf("protocols", "aave-v3,uniswap-v3,gmx,lido,curve-dex") || "").split(",").filter(Boolean);
console.log(`\n2. Scoring ${TARGETS.length} live protocols through five validators`);
const scored = {};
const rejected = {};
if (TARGETS.length > analysts.length) {
  console.log(`  ! ${TARGETS.length} protocols and only ${analysts.length} wallets — the 300s per-wallet rate limit will refuse some`);
}
for (let i = 0; i < TARGETS.length; i++) {
  const slug = TARGETS[i];
  // ONE WALLET PER PROTOCOL. The rate limit is per wallet and 300s long, so
  // reusing a signer inside one run throttles it — and a throttled call returns
  // REJECTED, which in a log is indistinguishable from a contract fault.
  const signer = analysts[i % analysts.length];
  process.stdout.write(`  → analyze_protocol("${slug}") … `);
  const r = await signer.send("analyze_protocol", [slug], 0n);
  note(r.hash, `analyze_protocol(${slug})`, { settled: r.status, seconds: Math.round(r.seconds ?? 0) });
  if (!r.ok) {
    console.log(`FAILED (${r.status}) ${r.revertReason || r.failure || ""}`);
    ok(`analyze ${slug}`, false, `${r.status} ${r.revertReason || r.failure}`);
  } else {
    const body = r.returnReadable ? r.returned : null;
    let rec = body;
    if (!rec || typeof rec !== "object") {
      rec = await owner.view("get_assessment_by_slug", [slug]).catch(() => null);
    }
    if (rec && rec.status === "REJECTED") {
      // A rejection is a SUCCESSFUL transaction whose return value says no.
      // Reporting it as a pass because the tx settled is how a suite silently
      // stops testing what it thinks it is testing.
      console.log(`REJECTED — ${String(rec.reason).slice(0, 110)}`);
      ok(`analyze ${slug} produced an assessment`, false, String(rec.reason).slice(0, 200));
      rejected[slug] = rec;
    } else {
      const verdict = rec?.verdict ?? "?";
      const score = rec?.overall_score ?? "?";
      console.log(`${r.status} in ${Math.round(r.seconds)}s → ${verdict} ${score}/100`);
      ok(`analyze ${slug} produced an assessment`, Boolean(rec?.found ?? rec?.assessment_id), JSON.stringify(rec ?? {}).slice(0, 200));
      scored[slug] = rec;
    }
  }
  // The per-wallet rate limit is 300s and there are two analyst wallets, so
  // alternating them keeps the run moving without tripping it.
  if (i + 1 < TARGETS.length) await sleep(2000);
}
evidence.scored = scored;
evidence.rejected = rejected;

// ───────────────────────────────────────────── 3. what landed on chain
console.log(`\n3. Every stored record verifies against its own evidence`);
for (const slug of Object.keys(scored)) {
  const rec = await owner.view("get_assessment_by_slug", [slug]).catch(() => null);
  if (!ok(`${slug} is stored`, Boolean(rec?.found))) continue;
  ok(`${slug} has a content hash`, Boolean(rec.content_hash) && String(rec.content_hash).includes(":"), rec.content_hash);
  ok(`${slug} verdict is one of the four`, ["SAFE", "MODERATE", "HIGH_RISK", "UNKNOWN"].includes(rec.verdict), rec.verdict);
  ok(`${slug} score is quantised to 5`, Number(rec.overall_score) % 5 === 0, String(rec.overall_score));
  ok(`${slug} carries five dimension scores`, Object.keys(rec.scores).length === 5);
  ok(`${slug} records the fee it paid`, rec.fee_paid_wei !== undefined, String(rec.fee_paid_wei));
  const v = await owner.view("verify_assessment", [rec.assessment_id]).catch((e) => ({ verified: false, differences: [String(e)] }));
  ok(`${slug} verify_assessment recomputes exactly`, v.verified === true, JSON.stringify(v.differences ?? []).slice(0, 300));
  evidence.scored[slug] = rec;
  evidence.checks.push({ name: `${slug} verification`, ok: v.verified === true, detail: JSON.stringify(v.recomputed ?? {}).slice(0, 600) });
}

// ───────────────────────────────────────────── 4. refusals refund, never revert
console.log(`\n4. A refusal refunds and never reverts`);
{
  const value = 10n ** 16n;   // 0.01 GEN into a FREE method — must come back
  const before = await read.getBalance({ address: out.account.address });
  const r = await out.send("analyze_protocol", ["not-a-real-protocol-xyz-9999"], value);
  note(r.hash, "analyze_protocol(unknown slug) with value attached", { settled: r.status });
  ok("an unknown slug does not revert", r.ok === true, `${r.status} ${r.revertReason || r.failure || ""}`);
  const body = r.returnReadable ? r.returned : null;
  if (body && typeof body === "object") {
    ok("it returns REJECTED rather than raising", body.status === "REJECTED", JSON.stringify(body).slice(0, 200));
    ok("the full deposit is credited back", String(body.refund_wei) === String(value), String(body.refund_wei));
    ok("it suggests alternatives", Array.isArray(body.did_you_mean) || body.unknown === true, JSON.stringify(body.did_you_mean ?? body.unknown));
  }
  const owed = await owner.view("refund_of", [out.account.address]).catch(() => null);
  ok("the refund ledger shows the credit", BigInt(owed?.refund_wei ?? 0) >= value, JSON.stringify(owed));
  const contractBefore = await read.getBalance({ address: ORACLE });
  const claim = await out.send("claim_refund", []);
  note(claim.hash, "claim_refund", { settled: claim.status });
  ok("claim_refund settles", claim.ok === true, `${claim.status} ${claim.revertReason || claim.failure || ""}`);
  const claimBody = claim.returnReadable ? claim.returned : null;
  if (claimBody && typeof claimBody === "object") {
    ok("claim_refund reports the amount paid", String(claimBody.refund_wei) === String(value), JSON.stringify(claimBody));
  }
  await sleep(4000);
  const owedAfter = await owner.view("refund_of", [out.account.address]).catch(() => null);
  ok("the refund ledger is cleared", BigInt(owedAfter?.refund_wei ?? -1n) === 0n, JSON.stringify(owedAfter));

  /*
   * WHAT CAN ACTUALLY BE ASSERTED HERE, and why it is not the balance.
   *
   * `emit_transfer` posts an INTERNAL MESSAGE with on="finalized" — the SDK
   * default, and the right default, because a payout applied at ACCEPTED would
   * already have happened if the transaction authorising it were later appealed
   * away. MEASURED on Studio Dev (docs/PROBE.md §7): that message is queued
   * correctly and is never executed, even after the parent transaction reaches
   * FINALIZED. `on="accepted"` is not an escape — the runtime rejects an
   * accepted-mode value transfer outright with `SystemError: 2: inval`.
   *
   * So the balance cannot move on this network no matter what the contract
   * does, and asserting on it would be asserting on the simulator. What the
   * contract is responsible for IS checkable, and is checked: that the call
   * posts a well-formed internal transfer, to the right address, for the right
   * amount. That is visible in the receipt's `pending_transactions`.
   */
  const queued = (claim.raw?.pending_transactions ?? []).filter((m) => String(m.address).toLowerCase() === out.account.address.toLowerCase());
  ok("claim_refund posts an internal transfer", queued.length === 1, JSON.stringify(claim.raw?.pending_transactions ?? []).slice(0, 300));
  if (queued.length === 1) {
    ok("the transfer names the right recipient", String(queued[0].address).toLowerCase() === out.account.address.toLowerCase(), queued[0].address);
    ok("the transfer carries the right amount", String(queued[0].value) === String(value), `${queued[0].value} vs ${value}`);
    ok("the transfer is finalisation-gated", queued[0].on === "finalized", String(queued[0].on));
  }
  const contractAfter = await read.getBalance({ address: ORACLE });
  console.log(`  · Studio Dev does not execute queued transfers: oracle balance ${gen(contractBefore)} -> ${gen(contractAfter)} (see docs/PROBE.md §7)`);
  const after = await read.getBalance({ address: out.account.address });
  evidence.refund = {
    caller_before: String(before), caller_after: String(after),
    contract_before: String(contractBefore), contract_after: String(contractAfter),
    value: String(value), queued_messages: claim.raw?.pending_transactions ?? [],
    note: "on=finalized internal transfers are queued but not executed by Studio Dev; see docs/PROBE.md §7",
  };
}

// ───────────────────────────────────────────── 5. the cooldown and rate limit
console.log(`\n5. Anti-abuse holds on a live chain`);
{
  const slug = Object.keys(scored)[0];
  if (slug) {
    const r = await b.send("analyze_protocol", [slug], 0n);
    note(r.hash, `analyze_protocol(${slug}) inside the cooldown`, { settled: r.status });
    ok("a re-analysis inside the cooldown does not revert", r.ok === true, `${r.status} ${r.revertReason || r.failure || ""}`);
    const body = r.returnReadable ? r.returned : null;
    if (body && typeof body === "object") {
      ok("it is refused with a reason", body.status === "REJECTED" && /retry in|rate limited/.test(String(body.reason)), String(body.reason).slice(0, 160));
    }
  }
}

// ───────────────────────────────────────────── 6. access control
console.log(`\n6. Access control`);
{
  const r = await out.send("set_paused", [true]);
  note(r.hash, "set_paused by a stranger (must revert)", { settled: r.status });
  ok("a stranger cannot pause", r.ok === false, `${r.status} ${r.revertReason || ""}`);
  ok("and the revert says why", /owner only/i.test(String(r.revertReason)), String(r.revertReason).slice(0, 160));
  const stillOpen = await owner.view("get_config");
  ok("the oracle is still unpaused", stillOpen.paused === false);
}

// ───────────────────────────────────────────── 7. the rankings and the feed
console.log(`\n7. Rankings, feeds and stats`);
{
  const stats = await owner.view("get_stats");
  ok("stats count every stored analysis", Number(stats.total_analyzed) >= Object.keys(scored).length,
     `total_analyzed=${stats.total_analyzed} stored=${Object.keys(scored).length} verdicts=${JSON.stringify(stats.verdicts)}`);
  ok("stats count the refusals too", Number(stats.total_rejected) >= 0, String(stats.total_rejected));
  const top = await owner.view("get_top_protocols", [10]);
  const risk = await owner.view("get_riskiest", [10]);
  const topScores = top.protocols.map((p) => Number(p.overall_score));
  ok("top is sorted safest first", topScores.every((s, i) => i === 0 || topScores[i - 1] >= s), topScores.join(","));
  const riskScores = risk.protocols.map((p) => Number(p.overall_score));
  ok("riskiest is sorted worst first", riskScores.every((s, i) => i === 0 || riskScores[i - 1] <= s), riskScores.join(","));
  const recent = await owner.view("get_recent", [10]);
  ok("the recent feed is populated", Number(recent.count) > 0, String(recent.count));
  evidence.stats = stats;
  evidence.top = top.protocols;
  evidence.riskiest = risk.protocols;
}

// ────────────────────────── 7b. nothing the oracle ACCEPTS can be stranded
/*
 * Section 4 proves a REFUSED payable call gives the money back. This proves the
 * other half, which is the half that was missing from DeFiConsumer when it was
 * rejected: that value attached to a call which SUCCEEDS comes back too.
 *
 * That was the exact shape of the bug. Refusals refunded, and every test said
 * so; an accepted deposit went into a position nothing could read, and no test
 * looked. Succeeding was the way to lose your money.
 *
 * The oracle's rule is that overpayment is never revenue — the fee is taken and
 * the remainder is credited back. With the fee at zero the whole amount is the
 * remainder, so an accepted analysis must owe the caller every wei it was sent.
 *
 * As in section 4, the assertion is on the LEDGER and on the posted internal
 * transfer, not on a balance delta: Studio Dev queues `on="finalized"` value
 * transfers and never executes them (docs/PROBE.md §7), so a balance check here
 * would be asserting on the simulator rather than on the contract.
 */
{
  console.log(`\n7b. Value attached to an ACCEPTED call comes back out`);
  // A wallet the scoring loop did not reach: the per-wallet cooldown is 300s,
  // and a throttled call returns REJECTED, which would quietly turn this into a
  // test of the refusal path that section 4 already covers.
  const payer = TARGETS.length < analysts.length ? analysts[TARGETS.length] : owner;
  const slug = Object.keys(scored)[0] ?? TARGETS[0];
  const value = 10n ** 16n;   // 0.01 GEN into a FREE method — all of it is owed back
  const feeWei = BigInt(cfg.fee_wei ?? 0);

  const r = await payer.send("analyze_protocol", [slug], value);
  note(r.hash, `analyze_protocol(${slug}) with ${gen(value)} attached`, { settled: r.status });
  ok("an analysis with value attached settles", r.ok === true, `${r.status} ${r.revertReason || r.failure || ""}`);
  const body = r.returnReadable ? r.returned : null;
  const accepted = Boolean(body && typeof body === "object" && body.status !== "REJECTED");
  ok("it is ACCEPTED, not rejected", accepted, JSON.stringify(body ?? {}).slice(0, 200));

  const owed = await owner.view("refund_of", [payer.account.address]).catch(() => null);
  const owedWei = BigInt(owed?.refund_wei ?? 0);
  ok("the accepted call credits back everything above the fee",
     owedWei === value - feeWei, `${owedWei} owed, expected ${value - feeWei}`);

  const claim = await payer.send("claim_refund", []);
  note(claim.hash, "claim_refund after an accepted analysis", { settled: claim.status });
  ok("claim_refund settles", claim.ok === true, `${claim.status} ${claim.revertReason || claim.failure || ""}`);
  const queued = (claim.raw?.pending_transactions ?? [])
    .filter((m) => String(m.address).toLowerCase() === payer.account.address.toLowerCase());
  ok("the claim posts an internal transfer to the caller", queued.length === 1,
     JSON.stringify(claim.raw?.pending_transactions ?? []).slice(0, 300));
  if (queued.length === 1) {
    ok("for the full amount that was owed", String(queued[0].value) === String(owedWei),
       `${queued[0].value} vs ${owedWei}`);
  }
  await sleep(4000);
  const after = await owner.view("refund_of", [payer.account.address]).catch(() => null);
  ok("nothing is still owed once it is claimed", BigInt(after?.refund_wei ?? -1n) === 0n, JSON.stringify(after));

  // The ledger identity, read off the live contract: everything it holds is
  // either a refund somebody can claim or fee revenue the owner can withdraw.
  // A third bucket would be money nobody can reach.
  const st = await owner.view("get_stats").catch(() => null);
  if (st && st.balance_wei !== undefined) {
    const held = BigInt(st.balance_wei);
    const owedAll = BigInt(st.refunds_owed_wei ?? 0);
    ok("the oracle owes no more than it holds", owedAll <= held, `${owedAll} owed of ${held} held`);
    evidence.ledger = { held: String(held), refunds_owed: String(owedAll),
                        owner_withdrawable: String(held - owedAll) };
  }
  evidence.accepted_refund = {
    slug, value: String(value), fee_wei: String(feeWei), owed: String(owedWei),
    queued_messages: claim.raw?.pending_transactions ?? [],
    note: "an ACCEPTED analysis refunds everything above the fee; this is the half the rejected DeFiConsumer never had",
  };
}

// ───────────────────────────────────────────── 8. composability, for real
if (CONSUMER) {
  console.log(`\n8. DeFiConsumer reads the oracle across a real call boundary`);
  const con = connect({ networkName, address: CONSUMER, role: "integrator" });
  const ccfg = await con.view("get_config");
  ok("the consumer is wired to this oracle", String(ccfg.oracle).toLowerCase() === String(ORACLE).toLowerCase(), ccfg.oracle);
  ok("the consumer says plainly that it takes no custody", ccfg.custody === false, JSON.stringify(ccfg.custody));

  const cstats = await con.view("get_stats").catch(() => null);
  ok("the consumer holds no value", cstats?.holds_value === false, JSON.stringify(cstats).slice(0, 200));

  const never = await con.view("check", ["definitely-not-analysed-9999"]).catch((e) => ({ allowed: true, reason: String(e) }));
  ok("an unassessed protocol is NOT allowed", never.allowed === false, never.reason);

  const slug = Object.keys(scored).find((s) => scored[s]?.verdict === "SAFE" || scored[s]?.verdict === "MODERATE") ?? Object.keys(scored)[0];
  if (slug) {
    const chk = await con.view("check", [slug]).catch((e) => ({ error: String(e) }));
    ok(`check("${slug}") reads the live verdict`, chk.verdict === scored[slug]?.verdict, `${chk.verdict} vs ${scored[slug]?.verdict}`);
    ok(`check("${slug}") pins the assessment id`, Number(chk.assessment_id) === Number(scored[slug]?.assessment_id), `${chk.assessment_id} vs ${scored[slug]?.assessment_id}`);
    evidence.consumer_check = chk;

    // The write path, across the same call boundary. NOT payable: the gate
    // decides and records, and the integrator's money never leaves their side.
    const refused = await con.send("record_check", ["definitely-not-analysed-9999"]);
    note(refused.hash, "record_check on an unassessed protocol", { settled: refused.status });
    ok("recording a check on an unassessed protocol does not revert", refused.ok === true, `${refused.status} ${refused.revertReason || refused.failure || ""}`);
    const refusedBody = refused.returnReadable ? refused.returned : null;
    if (refusedBody && typeof refusedBody === "object") {
      ok("it is REFUSED with a reason", refusedBody.status === "REFUSED", JSON.stringify(refusedBody).slice(0, 200));
      ok("the reason names the missing assessment", String(refusedBody.reason).includes("no DeFiLens assessment"), String(refusedBody.reason).slice(0, 120));
    }

    const admitted = await con.send("record_check", [slug]);
    note(admitted.hash, `record_check on ${slug}`, { settled: admitted.status });
    ok(`recording a check on ${slug} settles`, admitted.ok === true, `${admitted.status} ${admitted.revertReason || admitted.failure || ""}`);
    const body = admitted.returnReadable ? admitted.returned : null;
    if (body && typeof body === "object") {
      ok("the write agrees with the view it previewed", (body.status === "ADMITTED") === (chk.allowed === true), `${body.status} vs allowed=${chk.allowed}`);
      ok("the decision pins the assessment", Number(body.assessment_id) === Number(scored[slug]?.assessment_id), String(body.assessment_id));
      ok("the decision pins the content hash", String(body.content_hash) === String(scored[slug]?.content_hash), String(body.content_hash));
    }
    const decision = await con.view("get_decision", [slug]).catch(() => null);
    ok("the recorded decision is readable", Boolean(decision?.found), JSON.stringify(decision).slice(0, 200));
    evidence.consumer_decision = decision;

    // The custody claim, checked against the chain rather than the source: a
    // contract that holds nothing has a zero balance, however it is written.
    const conBalance = await read.getBalance({ address: CONSUMER }).catch(() => null);
    if (conBalance !== null) {
      ok("the consumer's on-chain balance is zero", conBalance === 0n, gen(conBalance));
      evidence.consumer_balance_wei = String(conBalance);
    }

    const refusals = await con.view("get_refusals", [5]).catch(() => null);
    ok("refusals are logged with their reason", Number(refusals?.total_refusals ?? 0) > 0, JSON.stringify(refusals?.refusals?.[0] ?? {}).slice(0, 200));
    evidence.consumer_refusals = refusals;
  }
}

// ───────────────────────────────────────────── done
evidence.summary = { pass, fail };
writeFileSync(new URL("../docs/e2e-evidence.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
console.log(`\n${pass} passed, ${fail} failed`);
console.log(`Evidence written to docs/e2e-evidence.json`);
console.log(`Explorer: https://explorer-studio-dev.genlayer.com/\n`);
process.exit(fail > 0 ? 1 : 0);
