# DeFiLens

**A risk oracle for DeFi protocols that any contract can read.**
Five GenLayer validators independently fetch DeFi Llama's public data, reduce it
to a feature vector, and have to agree on *every number* before one of them is
written on chain.

| | |
|---|---|
| Live site | https://defilens-sigma.vercel.app |
| Network | GenLayer Studio Dev (chain `61997`) |
| Oracle | [`0x0A87bbebEA59ae55a43c6e721213d4CCF672d1Bc`](https://explorer-studio-dev.genlayer.com/) |
| Consumer | [`0x77DAF72BbaA65f3613D503b21BDb4A2C0858b1B1`](https://explorer-studio-dev.genlayer.com/) |
| Offline tests | 330, all passing |
| Audit | 67 checks, 0 failures — `bash tools/audit.sh` |

---

## The problem

A depositor asking "is this protocol safe?" has to trust whoever answers. An
oracle that reports a risk score is only as good as its worst validator: if one
node can choose the TVL figure the score is computed from, it can manufacture
any verdict it likes, and nobody reading the result afterwards can tell.

DeFiLens is built so that no single node — including the leader — can choose
anything that reaches storage.

## How it works

Submit a DeFi Llama protocol slug to `analyze_protocol`. Then:

1. **Every validator fetches the same two public documents** from
   `api.llama.fi` — the protocol list and `/protocol/{slug}`. The host is a
   module constant, never a caller argument, so a submitter cannot point the
   validators at a server they control.
2. **Each reduces the response to a sixteen-integer feature vector** — TVL to
   three significant figures, peak TVL, chain count, age in days, health and
   momentum percentages to the nearest five — plus six identity strings and a
   content hash covering both.
3. **Consensus compares the whole axis, with exact equality.** The tolerance
   lives in the quantisation, never in the comparison: two validators reading
   TVL a cache-refresh apart produce identical bytes, while genuine news does
   not survive rounding. A real disagreement produces an UNDETERMINED round,
   which applies no state.
4. **After agreement, every stored value is recomputed** from the agreed vector
   by pure functions. The leader's own `scores` dict never reaches storage — it
   exists only to be compared.

### Scoring

Five dimensions, each quantised onto eight ordinals, weighted to 100:

| Dimension | Weight |
|---|---:|
| TVL health (current vs. peak) | 25 |
| Chain diversity | 20 |
| Maturity (age of the TVL series) | 20 |
| Category risk | 20 |
| Momentum (30-day change) | 15 |

Plus an **audit bonus worth at most 4 points**, and it is the only place a
language model is used. It never picks freely: a deterministic bracket computed
from DeFi Llama's own `audits` count decides the range, and where the bracket is
one ordinal wide the model is not called at all. Unreadable answers and an
unreachable model both fall back to the *least* generous ordinal — a model
failure can only ever cost a protocol points, never award them.

Verdicts: `SAFE` ≥ 70, `MODERATE` ≥ 40, `HIGH_RISK` below, and `UNKNOWN` for a
protocol with no TVL history. **UNKNOWN is not a low score** — reporting an
absent feed as high risk would defame a protocol for a gap in somebody else's
data. `is_safe` returns false for it, because "we have never heard of it" must
not read the same as "we checked and it is fine".

## Reading it from a contract

`DeFiConsumer` is a working example: a vault that refuses deposits into
protocols the oracle has not cleared.

```python
def _ask(self, slug: str) -> typing.Any:
    """One cross-contract read. Never raises — a consumer that has to catch
    an exception to learn "not analysed" is a consumer whose happy path runs
    through an error handler."""
    return IDeFiLens(self.oracle).view().get_risk_summary(slug)

@gl.public.write.payable
def deposit(self, protocol_slug: str) -> typing.Any:
    """NEVER RAISES. Every refusal credits the deposit back, claimable
    with withdraw()."""
    ...
    summary = self._ask(slug)
    verdict = str(summary.get("verdict", V_UNKNOWN))
    ...
```

It reads `get_risk_summary` through a `@gl.contract.interface`, enforces a
minimum score (55) and a maximum assessment age (7 days), and records every
refusal with its reason in a bounded ring — a consumer that a stranger could
grow without bound by sending dust is a consumer with a denial-of-service in it.
The oracle being unreachable is not the depositor's fault and does not cost them
their deposit.

## The six rules

Each is a past rejection written down so it cannot happen again. They are at the
top of `contracts/DeFiLens.py`; the reasoning is in
[`contracts/NOTES.md`](contracts/NOTES.md).

1. **Consensus binds every stored value.** A field the validators did not
   compare is a field the leader can forge.
2. **A payable method may never raise.** A revert rolls back storage but not the
   incoming value. Refusals credit a pull-based refund and return `REJECTED`.
3. **No counter moves before a path that can still refuse.**
4. **The fee is snapshotted at creation.** An owner who raises the price
   tomorrow cannot restate the price of work already done.
5. **A written assessment is immutable.** Re-analysis appends to a 6-deep ring
   buffer; it never edits an old record.
6. **The owner cannot freeze user money.** Refunds and every read are ungated on
   `paused`.

## Verifying a rating yourself

Every assessment stores the evidence it came from and the rubric version.
`verify_assessment` recomputes the score from the stored vector and reports
whether it still matches — years later, against the same pure functions.

On the current chain state, **10 of 10 stored records recompute exactly**.
The site exposes this on every protocol page.

## Layout

```
contracts/DeFiLens.py      the oracle (2,412 lines)
contracts/DeFiConsumer.py  a contract that reads it (499 lines)
contracts/NOTES.md         why it is built this way, and the hazards
contracts/_render_probe.py the throwaway probe that measured validator egress
docs/PROBE.md              what the probe found, with raw responses
docs/evidence.json         live chain state
test/test_logic.py         330 offline tests against a GenVM stub
test/e2e.mjs               end-to-end against Studio Dev
tools/audit.sh             67 mechanical checks
frontend/                  Next.js 16 site, six pages
```

## Running it

```bash
# offline suite — no network, no chain
cd test && python3 -m unittest test_logic

# every mechanical check
bash tools/audit.sh

# end-to-end against Studio Dev (spends testnet funds)
cd test && node e2e.mjs

# the site
cd frontend && npm install && npm run dev
```

## What was measured, not assumed

The data path rests on a probe contract deployed to Studio Dev and thrown away
([`docs/PROBE.md`](docs/PROBE.md)). Three findings changed the design — chiefly
that **a 29 MB document parses inside the execution budget**, which removed the
need for Range requests against `/protocols` with hand-rolled bracket matching
to recover one row from a truncated JSON fragment.

Two more hazards it caught, both silent: a `float` in a nondet return is not
calldata encodable, and `Proxy.emit(value=…)` posts no message at all where
`emit_transfer` does — so money leaves through exactly one helper in each
contract, and a test keeps it that way.
