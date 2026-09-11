# Probe findings

Everything in DeFiLens is written against what a GenLayer validator was
**measured** doing, not against what the DeFi Llama docs say. This file is the
record of those measurements.

The probe contract is `contracts/_render_probe.py` — a throwaway, deployed to
Studio Dev (chain 61997) and thrown away. Raw responses are in
`docs/probe-raw.json`. Dates below are 2026-09-11.

Three findings changed the design. Two of them would have been discovered only
after the contract was written, and one of them silently.

---

## §1 — Validator egress reaches api.llama.fi, and there is no size wall

`probe_statuses` and `probe_size_ladder`, seven endpoints in one transaction,
**13 seconds total**:

| endpoint | bytes | parsed |
|---|---:|---|
| `/tvl/aave-v3` | 18 | float |
| `/v2/chains` | 64,265 | list[467] |
| `/config/smol/appMetadata-protocols.json` | 1,570,052 | dict{9332} |
| `/protocol/gmx` | 2,259,243 | dict{26} |
| `/lite/protocols2` | 6,773,504 | dict{4} |
| `/protocols` | 8,795,782 | list[8227] |
| `/protocol/aave-v3` | **29,246,638** | dict{34} |

A plain `gl.nondet.web.request(url, method="GET")` is enough — no browser render
path is needed, and none is in the contract.

**A 29 MB document parses inside the execution budget.** That is the finding the
whole data path rests on. The alternative design — Range requests against
`/protocols`, with hand-rolled bracket matching to recover a single row from a
truncated JSON fragment — was on the table before this measurement and is not
needed.

A slug that does not exist answers **`400 Protocol not found`**, not 404. That
is why `_transient()` treats 400 as a real answer: reading it as transient would
make a typo retry forever instead of telling the caller they made one.

## §2 — A float in a nondet return is not calldata encodable

The probe died on its own first extraction run:

```
TypeError: not calldata encodable 17270822091.14536: float
key 'tvl'
key 'Return'
```

Every TVL figure DeFi Llama publishes is a float, and **no float may cross the
consensus boundary**. The error names the offending key and nothing else — no
line, no type context — so finding it in a 2,000-line contract would have cost
real time.

Consequences in the contract: the feature vector carries whole-USD `int`s only,
`_safe()`-style coercion happens inside `leader_fn` before anything is returned,
and `test_the_collected_payload_is_calldata_safe` walks a real payload and fails
on any leaf that is not `int | str | bool | list | dict`.

A second shape finding from the same run: **a parent protocol's own document
carries `chains: []`.** `/protocol/aave` returns an empty chain list, so the
per-chain TVL map is the only chain source for a parent — and its keys carry
suffixed views of the same chain (`Ethereum`, `Ethereum-borrowed`), which must
be folded or a protocol on three chains is counted as being on six.

## §3 — `aave` is not a row in `/protocols`, and `compound` is not a slug at all

`probe_resolve` on five real slugs:

| submitted | resolves as | why |
|---|---|---|
| `aave-v3` | child | exact `slug` match, `category: Lending`, 21 chains |
| `aave` | **parent** | no row has `slug == "aave"`; 7 rows have `parentProtocolSlug == "aave"` |
| `gmx` | **parent** | 4 children: `gmx-v2-perps`, `gmx-v1-perps`, `gmx-v1-amm`, `gmx-v2-amm` |
| `uniswap` | **parent** | 5 children across 48 chains |
| `compound` | **unknown** | the family is `compound-finance`; `compound` matches nothing |

A resolver that only did exact slug matching would reject `aave`, `uniswap` and
`gmx` — the three most recognisable names in DeFi. So `_resolve()` falls back to
aggregating children, and the aggregation rules are fixed in code so the leader
and every validator perform them identically:

- **category** by child **TVL weight**, not by child count. A family with six
  dead forks and one live lending market is a lending protocol.
- ties broken **alphabetically**, because two children with identical TVL would
  otherwise order by dict iteration and the category could differ between nodes.
- **chains** = the sorted union; **listedAt** = the earliest child.

`compound` is the case that justifies the suggestion list: a caller who types it
gets `did_you_mean: ["compound-blue", "compound-finance", "compound-v1",
"compound-v2", "compound-v3", …]` rather than a bare refusal.

## §4 — `/protocols` is served from a 30-minute cache, and that sets the consensus margin

Six fetches over two and a half minutes returned **byte-identical bodies**:

```
cache-control: public, max-age=1798
last-modified: Fri, 11 Sep 2026 07:06:58 GMT
age: 315 … 444
cf-cache-status: HIT
```

So two validators in one round almost always read the same numbers. "Almost
always" is not a consensus rule, though, and a round that straddles a cache
refresh reads two different TVL figures for the same protocol.

That is why the axis carries **buckets and quantised values, never raw floats**:
`tvl_sig` and `peak_sig` are rounded to three significant figures,
`health_pct` and the momentum percent to the nearest five, and the five
dimensions to one of eight ordinals. `_agrees()` then demands **exact equality**
— the tolerance is in the quantisation, not in the comparison, because two
accepted outputs for one request that differ are two answers to one question.

## §5 — The message clock, not a wall clock

`age_days` and the 30-day momentum window both need a "now". Read per node it
differs by seconds between leader and validator, and that difference lands
straight on the maturity and momentum axes.

`gl.message.raw["datetime"]` is part of the transaction and identical on every
validator. It is computed **outside** the nondet closure and passed in as a
plain int. The window is then anchored on `_day(now)` — floored to midnight UTC
— so the 30-day reference point is stable for a whole day rather than moving
every second.

## §6 — Two spellings that are pre-v0.6 and fail differently

`gl.contract_interface` **fails at deploy**, loudly:

```
AttributeError: module 'genlayer' has no attribute 'contract_interface'
```

The v0.6 spelling is `gl.contract.interface`, and the proxy's write namespace is
`.emit()`, not `.write()`.

## §7 — `Proxy.emit(value=…)` posts no message, and Studio Dev does not execute the one that works

The dangerous one, because it **fails silently**.

The spelling inherited from earlier projects —

```python
_Payee(who).emit(value=u256(amount))
```

— posts **no message at all**. `Proxy.emit()` returns a method *getter*, a
namespace you are then meant to call a method on; an `emit()` with nothing after
it constructs an object and drops it.

Every refund looked perfect. The transaction settled `ACCEPTED`, the internal
ledger zeroed, `claim_refund` returned `{"status": "OK", "refund_wei": …}`, and
**not one wei moved**. It was caught by comparing the contract's on-chain
balance before and after a claim — the only check that could have caught it, and
one that had to be written on purpose.

The working spelling is `gl.contract.get_at(who).emit_transfer(u256(amount))`.
With it, the receipt carries a correctly-formed queued message:

```json
{"on": "finalized", "value": "20000000000000000",
 "address": "0xD523328c3f2218a954741ACE978f6FeF81437B14"}
```

Two further measurements about that message:

1. **It needs its own fee allocation.** A generic `estimateTransactionFees()`
   produces `totalMessageFees: 0` and no `messageAllocations`, and the
   transaction is then accepted by the node and fails inside it with
   `fee no_matching_allocation # internal` — which reads like a contract fault
   and is not one. `estimateTransactionFeesForWrite()` simulates the call with
   the real signer and real arguments and returns an allocation naming the real
   recipient. `test/harness.mjs` uses it for every write.

2. **Studio Dev queues the message and never executes it.** The parent
   transaction reaches `FINALIZED`, `pending_transactions` carries the transfer,
   and the balance does not move — measured over 20 minutes, with
   `finalizeTransaction`, `finalizeIdlenessTxs` and `waitForFinalization` all
   tried. `on="accepted"` is not an escape: the runtime rejects an
   accepted-mode value transfer outright with `SystemError: 2: inval`.

`on="finalized"` is kept, because it is also the *right* setting — a payout
applied at acceptance would already have happened if the authorising transaction
were later appealed away. The consequence is recorded honestly rather than
papered over: on Studio Dev a claimed refund is queued, not delivered, and
`test/e2e.mjs` asserts what the contract is actually responsible for — that the
call posts a well-formed internal transfer, to the right address, for the right
amount, gated on finalisation.
