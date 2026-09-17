# Design notes and hazards

Why DeFiLens is built the way it is. The short version is at the top of
`DeFiLens.py` as numbered rules; this is the reasoning behind them, plus the
things that are easy to get wrong and expensive to discover. §3a is the newest
and was the most expensive: a rule that was only half-obeyed reads exactly like
a rule that was obeyed.

Probe evidence: `docs/PROBE.md`. Live state: `docs/evidence.json`.

---

## 1. What consensus binds

**Every stored value.** Not the verdict, not "the important fields" — every
single one. A field the validators did not compare is a field the leader can
forge, and a forged TVL on a risk oracle is the whole attack.

The compared axis is:

- the **feature vector**: sixteen integers, each with a declared `(lo, hi)` in
  `FEATURE_RANGE`, enforced identically by `_coherent` before a vote, by
  `_agrees` during one, and by `verify_assessment` years later;
- the **identity strings**: slug, name, category, the sorted chain CSV, the
  children CSV, the audit note — all six in `IDENTITY_KEYS`;
- the **content hash**, which covers both.

Everything in storage is then one of three things:

| kind | examples | bound by |
|---|---|---|
| the vector | `evidence`, `tvl_usd`, `chain_count`, `age_days`, `momentum_off` | compared directly |
| derived from the vector | every dimension score, `overall_score`, `verdict`, `labels`, `kind`, `content_hash` | `_score()` / `_bands()`, pure functions |
| contract bookkeeping | `assessment_id`, `seq`, `analyzed_at`, `analyst`, `fee_paid_wei` | the contract, never the leader |

`test_EVERY_STORED_FIELD_IS_ON_THE_AXIS` enumerates `Assessment.__annotations__`
and fails if a field is in none of those three sets. A new storage field cannot
be added without either putting it on the axis or saying, in the test, why it
does not belong there.

`_write()` reads only from `out` — the agreed object — and **runs `_score()`
again on the agreed vector** rather than storing the leader's `scores` dict.
`_coherent` has already proved the leader's arithmetic matches; recomputing is
belt and braces, so that even if that gate were weakened no number the leader
chose could reach storage.

### Why bucketing is not a shortcut

Two validators fetch `api.llama.fi` seconds apart. A raw TVL float would differ
between them whenever the Cloudflare cache refreshed mid-round
(docs/PROBE.md §4), and `_agrees` demands exact equality. So:

- TVL and peak TVL are rounded to **three significant figures**;
- health and momentum percentages to the **nearest five**;
- the five dimensions to one of **eight ordinals**, on ladders whose narrowest
  rung is a 5-percentage-point band and whose widest is a decade.

The tolerance lives in the quantisation, never in the comparison. A comparison
with a tolerance in it would mean two accepted outputs for one request could
differ — and then which one is the assessment?

The direction of failure is deliberate: a genuine disagreement produces an
UNDETERMINED round, which applies no state, so the caller resubmits and nothing
wrong is stored. `test_a_small_live_tvl_drift_still_agrees` and
`test_a_large_tvl_move_correctly_does_not_agree` pin both halves — quantisation
must absorb noise and must **not** absorb news.

## 2. Where the model is, and how far it can reach

One call, in `_judge_audit`, worth at most **four points out of a hundred**.

It never picks freely. `_audit_bracket` computes a deterministic `(lo, hi)` from
DeFi Llama's own `audits` count, whether audit links exist, and whether the
audit note is substantive. Where `lo == hi` the model is **not called at all**.
Where they differ the choice is between two *adjacent* ordinals.
`test_every_bracket_is_at_most_two_wide` proves no bracket is ever wider.

The ordinal is on the consensus axis like everything else, so the validator runs
its own model call and must reach the same answer. Low cardinality is what makes
that workable, and it is why the bracket exists at all.

Two more guards:

- `_parse_ordinal` falls back to **`lo`** — the least generous ordinal — on any
  answer it cannot read. A model failure can only ever *cost* a protocol points.
  If garbage could award them, a broken model would be a way to make something
  look safer than the evidence supports.
- an unreachable model returns `lo` rather than raising. The other 96 points are
  pure arithmetic and do not deserve to be thrown away because a GPU was busy.

The audit note is third-party text, so it is delimited in the prompt and
followed — *after* the data, where a prompt injection cannot get in front of it
— by an instruction saying nothing inside the markers is an instruction. The
note is also on the identity axis, so a leader cannot show the model one note
and the validators another.

## 3. Money

**Rule: a payable method may never raise.** A revert rolls back storage but not
the incoming value, which then sits in the contract unaccounted for. Every
refusal in `analyze_protocol` goes through `_reject`, which credits the full
deposit to a pull-based ledger and returns `{"status": "REJECTED", …}`.

The deposit is booked into `balance_wei` **before anything can refuse**, because
a rejection credits a refund out of that same balance and the ledger would
otherwise go negative on the very first bad slug.

**Rule: no counter moves before a path that can still refuse.** Every increment
happens after the last possible rejection. `TestNoCounterMovesBeforeARefusal`
snapshots seven counters and asserts a bad slug, an underpayment, a pause and a
capacity refusal each move **none** of them — and that an unknown protocol bumps
`total_requests` (the request did happen and did reach consensus) but not
`total_analyzed`, not `total_fees_wei`, not `next_id`.

**Rule: the fee is snapshotted at creation.** `fee_paid_wei` records what *this*
assessment cost. An owner who raises the price tomorrow cannot restate the price
of work already done.

**Rule: the owner cannot freeze user money.** `claim_refund` and every read are
ungated on `paused`. `withdraw_fees` subtracts `refunds_owed` before offering a
balance, so credited-but-unclaimed refunds are never withdrawable. Pause stops
new risk arriving and does nothing else.

**Hazard: the payout spelling is silent when wrong.** See docs/PROBE.md §7.
`Proxy.emit(value=…)` posts no message; `emit_transfer` does. Money leaves
DeFiLens through exactly one helper, `_pay`, and
`test_money_leaves_defilens_through_exactly_one_helper` keeps it that way. It
leaves DeFiConsumer through none, because DeFiConsumer holds none — see §3a.

## 3a. The half of rule 2 that was missing

**Rule: value a contract accepts must be value somebody can get back out.**

Rule 2 says a payable method must refund rather than revert, and DeFiConsumer
obeyed it perfectly — on the refusal path. The accepted path had no exit at all:

```
deposit(value)  ──refused──> self.balances[who] += value   ──> withdraw() ✓
                ──accepted─> pos.amount_wei     += value   ──> nothing
```

`withdraw()` paid out of `balances`, which an accepted deposit never touched. A
depositor whose deposit SUCCEEDED could not get it back. Every refusal test
passed, because every refusal really did refund; nothing looked at the other
half. **Succeeding was the way to lose your money.**

Two things are worth taking from it.

**The check has to follow the value, not count the methods.** "Is there a
withdraw?" answered yes the entire time. `tools/custody_scan.py` taints
`gl.message.value`, propagates it through local names and through the private
helpers a payable method hands it to, and reports every `self.<field>` it lands
in; then it asks which of those fields a public write that ANYONE may call —
no `_only_owner()` — actually reads and pays from. The difference is trapped
money. Run against the rejected file it reports `positions`, `refusals`,
`total_deposited`, `total_refused`; against the current pair, nothing.

The scan is imported by the offline suite and run by `tools/audit.sh`, so the
tests and the audit cannot drift apart on what "trapped" means, and
`test_the_scan_catches_the_shape_that_was_rejected` runs the rejected shape
through it and asserts it comes back flagged. A guard that has only ever seen
code it passes is a guard nobody has tested.

**The better fix was less contract, not more.** A `withdraw_position()` would
have closed the hole and left a demo contract holding strangers' money for no
reason. Custody was never part of what DeFiConsumer was demonstrating — it read
an oracle and applied a policy, and the deposits were scaffolding that made the
demonstration look bigger while carrying the one risk scaffolding should never
carry. So the payable surface is gone, `get_config` says `"custody": False`,
`get_stats` says `"holds_value": False`, and the audit asserts the file contains
no `gl.message.value`, no `def deposit`, no `def withdraw` and no
`emit_transfer` at all.

DeFiLens still takes value, because it has a reason to: a fee. There the rule is
discharged by the ledger identity — everything it holds is either a refund its
sender can claim or fee revenue the owner can withdraw, and `withdraw_fees`
subtracts `refunds_owed` before offering a balance. `value_lands_in` reports
exactly `balance_wei`, `refund_wei` and `refunds_owed`; `claim_refund` reads all
three and is ungated on pause.

## 4. Immutability

A written assessment is never mutated. A re-analysis appends a new record into
the protocol's ring buffer; it does not edit the old one. Nothing — not the
owner, not a pause, not a later re-analysis — reaches a record after it is
written. `TestImmutabilityAfterWrite` enumerates every public write and asserts
the only owner-gated ones are the four that govern price, pause, ownership and
revenue.

The ring holds `HISTORY_CAP` assessments per protocol. An id whose record has
rotated out reports **that**, by name, rather than returning whatever now
occupies the slot:

```json
{"found": false, "verdict": "UNKNOWN",
 "reason": "record rotated out of the 6-assessment history window for aave-v3"}
```

## 5. Stuck rounds

`analyze_protocol` sets a per-slug in-flight marker before consensus and clears
it on every exit. A round that never settles applies no state, so the usual case
needs nothing at all.

`settle_stalled` exists for the other case: a round that *did* set the marker and
then failed in a way that left it set. It is **permissionless and works while
paused** — an owner who could keep a protocol locked by declining to unstick it
could censor the oracle, which is the same power as forging a verdict by a
slower route.

## 6. UNKNOWN is not a low score

A protocol DeFi Llama tracks but has no TVL history for cannot be scored. It is
recorded as `UNKNOWN` with `overall_score: 0`, and that is **not** the same
claim as HIGH_RISK. Reporting an absent feed as high risk would defame a
protocol for a gap in somebody else's data; reporting it as safe would tell a
depositor that an absence of evidence is evidence of safety.

`get_riskiest` and `get_top_protocols` both exclude UNKNOWN. Leaving it in would
put every unscorable protocol at the top of the riskiest list and bury the ones
that were actually measured and found wanting.

`is_safe` returns **false** for unanalysed, unknown and unparseable — a contract
asking that question is about to move money, and "we have never heard of it"
must not read the same as "we checked and it is fine". `require_safe` reverts on
HIGH_RISK, on UNKNOWN and on not-yet-analysed; the brief asks only for the first,
and the other two are there because passing an unanalysed protocol would make
the guard a rubber stamp for exactly the protocols nobody has checked.

## 7. Smaller hazards, in one place

- **`str.replace()` is rejected by the runner.** Slice around `find()` instead.
  `test_str_replace_is_never_used` walks the AST of both contracts.
- **A `float` in a nondet return is not calldata encodable** (docs/PROBE.md §2).
- **`bool` is an `int` in Python.** `_as_int` excludes it explicitly and
  `_coherent` rejects a vector field that arrived as a boolean, or a `True`
  would silently score as 1 rather than being caught.
- **A TreeMap with a scalar value type answers a missing key with that type's
  zero, not `None`.** A presence check written as `is not None` therefore matches
  everything. Struct-valued maps *do* answer `None`. The offline stub reproduces
  both behaviours; a stub that returned `None` for everything could not.
- **`DynArray.append_new_get()` returns a reference**, not a copy. The stub
  returns the same object the array holds, or a test would pass while every
  position written on chain stayed zero.
- **The runner header is exactly two lines.** GenVM parses the contiguous
  leading `#` block as the header, and a stray comment between line 1 and the
  imports makes the contract undeployable with no error but `invalid_contract`.
  `test_the_runner_header_is_exactly_two_lines` pins it.
- **`first_day` is the minimum date, not element zero.** Taking the first
  element works today, because DeFi Llama serves the series ascending — and it
  would put a third party's array *order* on the consensus axis, so the day a
  reordering shipped every maturity score would change. Caught offline by
  `test_series_facts_are_order_independent`.
- **The 30-day window is anchored on the series' own last day**, not on `now`. A
  feed that stopped updating a week ago must not be measured as though its last
  figure were today's — that reads a dead protocol as perfectly stable.
- **The slug must contain a letter or digit.** `../..` survives scheme
  stripping, path segmenting and the character allowlist as `..`, and
  `/protocol/..` resolves to the API root — a path escape built out of nothing
  but punctuation.
- **The host is never taken from a caller.** `LLAMA_LIST` and `LLAMA_DETAIL` are
  module constants. A submitter who could name the host could point five
  validators at a server they control and manufacture any verdict they liked.
