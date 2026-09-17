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
| Consumer | [`0x635381543a601a4209930Ad34A4e60F023E97509`](https://explorer-studio-dev.genlayer.com/) |
| Offline tests | 346, all passing |
| Contract audit | 102 checks, 0 failures — `bash tools/audit.sh` |
| Site audit | all green — `node tools/audit_site.mjs` |
| Claims audit | all green — `node tools/audit_claims.mjs` |

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

`DeFiConsumer` is a working example: the **admission gate** a vault would run
before it moved money. It reads the oracle, applies its own policy, and records
what it decided with the evidence behind it.

**It takes no custody.** No payable method, no balance, no transfer anywhere in
the file. The read and the decision are the demonstration; moving the money
belongs to the integrator, whose withdrawal path already exists. A demo contract
that accepts deposits has to answer for every wei it takes, and this one has no
reason to be in that position — see [rule 7](#the-seven-rules).

```python
def _ask(self, slug: str) -> typing.Any:
    """One cross-contract read. Never raises — a consumer that has to catch
    an exception to learn "not analysed" is a consumer whose happy path runs
    through an error handler."""
    return IDeFiLens(self.oracle).view().get_risk_summary(slug)

@gl.public.write            # NOT payable. This contract holds nothing.
def record_check(self, protocol_slug: str) -> typing.Any:
    """Run the gate against a protocol and RECORD what it decided."""
    decision = self._decide(protocol_slug)      # the same evaluator check() uses
    self._record(decision, self._now())
    ...
```

It reads `get_risk_summary` through a `@gl.contract.interface`, enforces a
minimum score (55) and a maximum assessment age (7 days), and records every
refusal with its reason in a bounded ring — a consumer that a stranger could
grow without bound by checking invented slugs is a consumer with a
denial-of-service in it. The oracle being unreachable is a refusal with a
reason, not an exception thrown at the caller.

`check()` (a view) and `record_check()` (a write) both call `_decide`, so what a
reader previews and what the chain records cannot drift apart.

## The seven rules

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
7. **Value a contract accepts must be value somebody can get back out.** The
   refusal path refunding is only half of it: an *accepted* call has to return
   what it does not keep, and a contract with no reason to hold funds should not
   be payable at all. `tools/custody_scan.py` follows `gl.message.value` into
   storage and fails the audit on any field no caller can drain.

## Verifying a rating yourself

Every assessment stores the evidence it came from and the rubric version.
`verify_assessment` recomputes the score from the stored vector and reports
whether it still matches — years later, against the same pure functions.

**Every stored record on chain recomputes exactly.** That is checked, record
by record, by `node tools/audit_claims.mjs`, and the site exposes the same
call as a button on every protocol page.

## The site

Six pages, light theme, mobile-first, no horizontal scroll at 390px.

| | |
|---|---|
| `/` | What it is, why it can be trusted, and one worked example contrasting the strongest and weakest ratings currently on the oracle |
| `/protocols` | Every rating as a card — score arc, verdict, TVL, category, chains — with search, verdict filters, category grouping and sorting |
| `/protocol/[slug]` | The full tearsheet: animated gauge, five weighted dimensions, TVL history, chain badges, the evidence vector, and a button that recomputes the rating on chain |
| `/analyze` | Autocomplete over every protocol DeFi Llama tracks, a preview of what the contract will make of the name, and first-run setup |
| `/compare` | Two protocols on the same rubric, dimension by dimension, winner marked |
| `/docs` | Getting started, methodology, the category table, an integration guide and a FAQ |

Rating a protocol needs **no wallet** — Studio Dev is faucet-funded and analysis
is free, so the site submits through a server-side relayer. The wallet control
and the chain badge appear only on the pages where they mean something, never on
the landing page. First-run setup adds the network, switches to it and funds an
address through the Studio faucet, each step performing the action rather than
printing instructions to follow by hand.

Screenshots of every page, desktop and mobile, are in [`screenshots/`](screenshots/).

## Layout

```
contracts/DeFiLens.py      the oracle (2,425 lines)
contracts/DeFiConsumer.py  a contract that reads it — no custody (489 lines)
contracts/NOTES.md         why it is built this way, and the hazards
contracts/_render_probe.py the throwaway probe that measured validator egress
docs/PROBE.md              what the probe found, with raw responses
docs/evidence.json         live chain state
test/test_logic.py         346 offline tests against a GenVM stub
test/e2e.mjs               end-to-end against Studio Dev
tools/audit.sh             102 mechanical checks over both contracts
tools/custody_scan.py      follows incoming value into storage; fails on a trap
tools/audit_site.mjs       browser checks — routes, 390px, console, links
tools/audit_claims.mjs     every number this README asserts, checked live
frontend/                  Next.js 16 site, six pages
```

## Running it

```bash
# offline suite — no network, no chain
cd test && python3 -m unittest test_logic

# every mechanical check over both contracts
bash tools/audit.sh

# where does incoming value land, and can anything drain it?
python3 tools/custody_scan.py contracts/DeFiLens.py contracts/DeFiConsumer.py

# every number this README claims, checked against the live chain
node tools/audit_claims.mjs

# end-to-end against Studio Dev (spends testnet funds)
cd test && node e2e.mjs

# the site
cd frontend && npm install && npm run dev

# the site, audited in a real browser (routes, 390px, console, links)
node tools/audit_site.mjs http://localhost:3000
```

## What was measured, not assumed

The data path rests on a probe contract deployed to Studio Dev and thrown away
([`docs/PROBE.md`](docs/PROBE.md)). Three findings changed the design — chiefly
that **a 29 MB document parses inside the execution budget**, which removed the
need for Range requests against `/protocols` with hand-rolled bracket matching
to recover one row from a truncated JSON fragment.

Two more hazards it caught, both silent: a `float` in a nondet return is not
calldata encodable, and `Proxy.emit(value=…)` posts no message at all where
`emit_transfer` does — so money leaves DeFiLens through exactly one helper, and
leaves DeFiConsumer through none, because it holds none. A test keeps both
numbers where they are.
