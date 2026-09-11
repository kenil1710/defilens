# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import genlayer as gl
from genlayer import *
from dataclasses import dataclass
import typing

# DeFiConsumer — a worked example of reading DeFiLens from another contract.
#
# It models a yield aggregator with ONE rule: it will only route deposits into
# protocols DeFiLens has scored, and it refuses the ones scored HIGH_RISK. That
# is the whole product. Everything else here exists to make the refusal
# observable — an allowlist, a per-protocol allocation, and a log of what was
# refused and why.
#
# Why this contract is worth reading:
#
#   1. IT TREATS THE ORACLE AS UNTRUSTED-BY-DEFAULT. `get_risk_summary` never
#      raises, so the happy path never depends on catching an exception, and
#      every field it returns is checked here before it is used. A consumer that
#      assumed `found` was true would treat "never analysed" as a score of zero
#      — or worse, as a pass.
#
#   2. IT PINS THE ASSESSMENT IT ACTED ON. Every accepted deposit records the
#      assessment id, the content hash and the verdict that admitted it. A
#      protocol that later degrades does not rewrite history, and an auditor can
#      ask "what did you know when you sent the money" and get an answer.
#
#   3. IT HAS A STALENESS RULE. A SAFE verdict from a year ago is not evidence
#      about today. `max_assessment_age_s` is the consumer's own policy, not the
#      oracle's, which is the right place for it: the oracle reports what it
#      measured and when, and each integrator decides how old is too old.
#
#   4. ITS REFUSALS REFUND. Same rule as DeFiLens itself: a payable method that
#      raises keeps the deposit with no record to refund it from.

ERR_EXPECTED = "[EXPECTED]"

V_SAFE = "SAFE"
V_MODERATE = "MODERATE"
V_HIGH_RISK = "HIGH_RISK"
V_UNKNOWN = "UNKNOWN"

# Defaults. Both are constructor arguments so a deployer can state their own
# risk appetite rather than inherit one.
DEFAULT_MIN_SCORE = 55
DEFAULT_MAX_AGE_S = 7 * 24 * 3600
MAX_POSITIONS = 200
MAX_LOG = 50



# --- helpers. Duplicated from DeFiLens rather than imported: GenVM deploys one
# file with no module path between contracts, so a shared import would simply
# fail to resolve at deploy time.

def _as_int(v: typing.Any, default: int = 0) -> int:
    if isinstance(v, bool):
        return default
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        t = v.strip()
        neg = t.startswith("-")
        if neg:
            t = t[1:]
        if t == "" or not t.isdigit():
            return default
        return -int(t) if neg else int(t)
    return default


def _clamp(v: int, lo: int, hi: int) -> int:
    return lo if v < lo else (hi if v > hi else v)


def _days_from_civil(y: int, m: int, d: int) -> int:
    y -= 1 if m <= 2 else 0
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def _epoch_from_iso(value: typing.Any) -> int:
    if not isinstance(value, str) or len(value) < 19:
        return 0
    try:
        year = int(value[0:4])
        month = int(value[5:7])
        day = int(value[8:10])
        hour = int(value[11:13])
        minute = int(value[14:16])
        second = int(value[17:19])
    except Exception:
        return 0
    if month < 1 or month > 12 or day < 1 or day > 31:
        return 0
    if hour > 23 or minute > 59 or second > 60:
        return 0
    return (_days_from_civil(year, month, day) * 86400
            + hour * 3600 + minute * 60 + second)

def _pay(who: Address, amount: int) -> None:
    """Send native value to an address. THE ONLY WAY MONEY LEAVES EITHER
    CONTRACT.

    Written out here rather than inlined because getting it wrong is SILENT.
    The obvious-looking spelling, inherited from earlier projects:

        _Payee(who).emit(value=u256(amount))

    posts NO MESSAGE AT ALL on this runner. `Proxy.emit()` returns a method
    GETTER — a namespace you are then supposed to call a method on — so an
    `emit()` with nothing after it constructs an object and drops it. Every
    refund appeared to succeed: the transaction settled ACCEPTED, the internal
    ledger zeroed, `claim_refund` returned {"status": "OK"}, and not one wei
    moved. It was caught by comparing the CONTRACT'S ON-CHAIN BALANCE before and
    after a claim, which is the only check that could have caught it.

    `emit_transfer` is the spelling that posts a bare value transfer.

    `on="finalized"` is the default and is kept deliberately. A payout applied
    at ACCEPTED would already have happened if the transaction that authorised
    it were later appealed and rolled back — the contract would have paid for a
    refund it no longer owed. Finalisation is slower and is the direction to be
    slow in.
    """
    if amount <= 0:
        return
    gl.contract.get_at(who).emit_transfer(u256(int(amount)))

@gl.contract.interface
class IDeFiLens:
    """The read surface DeFiConsumer depends on.

    DELIBERATELY NARROW: `get_risk_summary` is the only method here, because it
    is the only one that never raises. `require_safe` would be shorter to call
    and would make every refusal a revert — which on a payable path means
    keeping the caller's deposit."""

    class View:
        def get_risk_summary(self, protocol_slug: str) -> typing.Any:
            pass

        def get_config(self) -> typing.Any:
            pass

    class Write:
        """No write methods: this consumer only ever READS the oracle. A
        consumer that could make the oracle write would be a consumer that could
        spend somebody else's rate limit."""
        pass


@gl.storage.allow
@dataclass
class Position:
    """What was deposited, and THE EVIDENCE THAT ADMITTED IT."""
    slug: str
    name: str
    category: str
    amount_wei: u256
    deposits: u32
    verdict_at_entry: str
    score_at_entry: u32
    assessment_id: u32
    content_hash: str
    first_deposit_at: u64
    last_deposit_at: u64


@gl.storage.allow
@dataclass
class Refusal:
    """A refused deposit, kept so the policy is auditable rather than asserted."""
    slug: str
    reason: str
    verdict: str
    score: u32
    amount_wei: u256
    at: u64
    who: Address


class DeFiConsumer(gl.contract.Contract):
    owner: Address
    oracle: Address
    min_score: u32
    max_assessment_age_s: u64
    paused: bool

    positions: gl.storage.TreeMap[str, Position]
    slugs: gl.storage.DynArray[str]
    refusals: gl.storage.DynArray[Refusal]
    refusal_cursor: u32

    balances: gl.storage.TreeMap[Address, u256]
    total_deposited: u256
    total_refused: u256
    deposit_count: u32
    refusal_count: u32

    def __init__(self, oracle: str, min_score: int = DEFAULT_MIN_SCORE,
                 max_age_s: int = DEFAULT_MAX_AGE_S):
        self.owner = gl.message.sender_address
        # An unusable oracle address is fatal HERE and only here. A consumer
        # deployed against a contract that cannot answer is a consumer whose
        # every deposit would be refused, which is worse than a failed deploy.
        self.oracle = Address(oracle)
        self.min_score = u32(_clamp(_as_int(min_score, DEFAULT_MIN_SCORE), 0, 100))
        self.max_assessment_age_s = u64(max(0, _as_int(max_age_s,
                                                       DEFAULT_MAX_AGE_S)))
        self.paused = False
        self.total_deposited = u256(0)
        self.total_refused = u256(0)
        self.deposit_count = u32(0)
        self.refusal_count = u32(0)
        self.refusal_cursor = u32(0)

    # --- internals ---------------------------------------------------------

    def _now(self) -> int:
        return _epoch_from_iso(gl.message.raw.get("datetime", ""))

    def _only_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(ERR_EXPECTED + " owner only")

    def _ask(self, slug: str) -> typing.Any:
        """One cross-contract read. Never raises — a consumer that has to catch
        an exception to learn "not analysed" is a consumer whose happy path runs
        through an error handler."""
        return IDeFiLens(self.oracle).view().get_risk_summary(slug)

    def _refuse(self, slug: str, reason: str, verdict: str, score: int,
                amount: int, now: int) -> dict:
        """Record the refusal, credit the deposit back, and RETURN.

        The refusal log is a ring: a consumer that could be made to grow storage
        without bound by a stranger sending dust is a consumer with a denial-of-
        service in it."""
        who = gl.message.sender_address
        if len(self.refusals) < MAX_LOG:
            row = self.refusals.append_new_get()
        else:
            row = self.refusals[int(self.refusal_cursor) % MAX_LOG]
        row.slug = str(slug)[:80]
        row.reason = str(reason)[:200]
        row.verdict = str(verdict)
        row.score = u32(_clamp(int(score), 0, 100))
        row.amount_wei = u256(max(0, int(amount)))
        row.at = u64(now)
        row.who = who
        self.refusal_cursor = u32((int(self.refusal_cursor) + 1) % MAX_LOG)
        self.refusal_count = u32(int(self.refusal_count) + 1)
        self.total_refused = u256(int(self.total_refused) + max(0, int(amount)))
        if amount > 0:
            self.balances[who] = u256(int(self.balances.get(who) or 0) + amount)
        return {"status": "REFUSED", "slug": str(slug)[:80],
                "reason": str(reason)[:200], "verdict": str(verdict),
                "score": _clamp(int(score), 0, 100),
                "refund_wei": max(0, int(amount))}

    # --- the product -------------------------------------------------------

    @gl.public.write.payable
    def deposit(self, protocol_slug: str) -> typing.Any:
        """Route a deposit into a protocol, if DeFiLens says it is safe enough.

        NEVER RAISES. Every refusal credits the deposit back, claimable with
        withdraw()."""
        amount = int(gl.message.value)
        who = gl.message.sender_address
        now = self._now()
        slug = str(protocol_slug).strip().lower()[:80]

        if self.paused:
            return self._refuse(slug, "this aggregator is paused", V_UNKNOWN, 0,
                                amount, now)
        if amount <= 0:
            return self._refuse(slug, "send some value to deposit", V_UNKNOWN,
                                0, 0, now)

        try:
            summary = self._ask(slug)
        except Exception as e:
            # The oracle being unreachable is not the depositor's fault and must
            # not cost them their deposit.
            return self._refuse(slug, "the risk oracle did not answer: "
                                + str(e)[:120], V_UNKNOWN, 0, amount, now)
        if not isinstance(summary, dict):
            return self._refuse(slug, "the risk oracle returned an unusable "
                                "answer", V_UNKNOWN, 0, amount, now)

        verdict = str(summary.get("verdict", V_UNKNOWN))
        score = _clamp(_as_int(summary.get("overall_score"), 0), 0, 100)

        if not summary.get("found"):
            return self._refuse(
                slug, "no DeFiLens assessment exists for this protocol — call "
                "analyze_protocol('" + slug + "') on the oracle first",
                V_UNKNOWN, 0, amount, now)
        if verdict == V_HIGH_RISK:
            return self._refuse(slug, "DeFiLens rates this HIGH_RISK", verdict,
                                score, amount, now)
        if verdict == V_UNKNOWN:
            return self._refuse(slug, "DeFiLens could not score this protocol",
                                verdict, score, amount, now)
        if score < int(self.min_score):
            return self._refuse(
                slug, "scored " + str(score) + "/100, below this aggregator's "
                "floor of " + str(int(self.min_score)), verdict, score, amount,
                now)

        age = _as_int(summary.get("age_of_assessment_s"), -1)
        limit = int(self.max_assessment_age_s)
        if limit > 0 and age >= 0 and age > limit:
            return self._refuse(
                slug, "the assessment is " + str(age) + "s old; this "
                "aggregator requires one no older than " + str(limit) + "s",
                verdict, score, amount, now)

        if slug not in self.positions and len(self.slugs) >= MAX_POSITIONS:
            return self._refuse(slug, "position capacity reached", verdict,
                                score, amount, now)

        pos = self.positions.get_or_insert_default(slug)
        if str(pos.slug) == "":
            pos.slug = slug
            pos.first_deposit_at = u64(now)
            self.slugs.append(slug)
        pos.name = str(summary.get("name", ""))[:80]
        pos.category = str(summary.get("category", ""))[:60]
        pos.amount_wei = u256(int(pos.amount_wei) + amount)
        pos.deposits = u32(int(pos.deposits) + 1)
        # The evidence that admitted THIS deposit, pinned. A protocol that later
        # degrades does not rewrite the record of what was known at the time.
        pos.verdict_at_entry = verdict
        pos.score_at_entry = u32(score)
        pos.assessment_id = u32(_as_int(summary.get("assessment_id"), 0))
        pos.content_hash = str(summary.get("content_hash", ""))[:80]
        pos.last_deposit_at = u64(now)

        self.total_deposited = u256(int(self.total_deposited) + amount)
        self.deposit_count = u32(int(self.deposit_count) + 1)
        return {"status": "OK", "slug": slug, "verdict": verdict,
                "score": score, "deposited_wei": amount,
                "position_wei": int(pos.amount_wei),
                "assessment_id": int(pos.assessment_id),
                "content_hash": str(pos.content_hash)}

    @gl.public.write
    def withdraw(self) -> typing.Any:
        """Claim refunded deposits. Pull, not push, and never gated on pause."""
        who = gl.message.sender_address
        amount = int(self.balances.get(who) or 0)
        if amount <= 0:
            return {"status": "NOTHING_OWED", "refund_wei": 0}
        self.balances[who] = u256(0)
        _pay(who, amount)
        return {"status": "OK", "refund_wei": amount}

    @gl.public.write
    def set_policy(self, min_score: int, max_age_s: int) -> typing.Any:
        """The aggregator's own risk appetite. It cannot change the oracle's
        verdicts, only how strictly this contract reads them."""
        self._only_owner()
        want = _as_int(min_score, -1)
        if want < 0 or want > 100:
            raise gl.vm.UserError(ERR_EXPECTED + " min_score must be 0..100")
        age = _as_int(max_age_s, -1)
        if age < 0:
            raise gl.vm.UserError(ERR_EXPECTED + " max_age_s must be >= 0")
        self.min_score = u32(want)
        self.max_assessment_age_s = u64(age)
        return {"status": "OK", "min_score": want, "max_assessment_age_s": age}

    @gl.public.write
    def set_paused(self, value: bool) -> typing.Any:
        self._only_owner()
        self.paused = bool(value)
        return {"status": "OK", "paused": bool(self.paused)}

    # --- reads -------------------------------------------------------------

    @gl.public.view
    def check(self, protocol_slug: str) -> typing.Any:
        """Would a deposit into this protocol be accepted, and why?

        The whole policy, evaluated without moving money. An integrator should
        never have to send a transaction to find out that they cannot."""
        slug = str(protocol_slug).strip().lower()[:80]
        try:
            summary = self._ask(slug)
        except Exception as e:
            return {"allowed": False, "slug": slug, "verdict": V_UNKNOWN,
                    "reason": "the risk oracle did not answer: " + str(e)[:120]}
        if not isinstance(summary, dict):
            return {"allowed": False, "slug": slug, "verdict": V_UNKNOWN,
                    "reason": "the risk oracle returned an unusable answer"}
        verdict = str(summary.get("verdict", V_UNKNOWN))
        score = _clamp(_as_int(summary.get("overall_score"), 0), 0, 100)
        age = _as_int(summary.get("age_of_assessment_s"), -1)
        limit = int(self.max_assessment_age_s)
        reason = ""
        if not summary.get("found"):
            reason = "no DeFiLens assessment exists for this protocol"
        elif verdict == V_HIGH_RISK:
            reason = "DeFiLens rates this HIGH_RISK"
        elif verdict == V_UNKNOWN:
            reason = "DeFiLens could not score this protocol"
        elif score < int(self.min_score):
            reason = ("scored " + str(score) + "/100, below this aggregator's "
                      "floor of " + str(int(self.min_score)))
        elif limit > 0 and age >= 0 and age > limit:
            reason = ("the assessment is " + str(age) + "s old; the limit is "
                      + str(limit) + "s")
        return {"allowed": reason == "", "slug": slug, "verdict": verdict,
                "score": score, "min_score": int(self.min_score),
                "assessment_age_s": age, "max_assessment_age_s": limit,
                "assessment_id": _as_int(summary.get("assessment_id"), 0),
                "content_hash": str(summary.get("content_hash", "")),
                "reason": reason if reason else "allowed"}

    @gl.public.view
    def get_position(self, protocol_slug: str) -> typing.Any:
        slug = str(protocol_slug).strip().lower()[:80]
        pos = self.positions.get(slug)
        if pos is None or str(pos.slug) == "":
            return {"found": False, "slug": slug, "amount_wei": 0}
        return self._position_view(pos)

    def _position_view(self, pos: Position) -> dict:
        return {"found": True, "slug": str(pos.slug), "name": str(pos.name),
                "category": str(pos.category),
                "amount_wei": int(pos.amount_wei),
                "deposits": int(pos.deposits),
                "verdict_at_entry": str(pos.verdict_at_entry),
                "score_at_entry": int(pos.score_at_entry),
                "assessment_id": int(pos.assessment_id),
                "content_hash": str(pos.content_hash),
                "first_deposit_at": int(pos.first_deposit_at),
                "last_deposit_at": int(pos.last_deposit_at)}

    @gl.public.view
    def get_positions(self) -> typing.Any:
        rows = []
        for i in range(len(self.slugs)):
            pos = self.positions.get(str(self.slugs[i]))
            if pos is not None and str(pos.slug) != "":
                rows.append(self._position_view(pos))
        return {"count": len(rows), "positions": rows,
                "total_deposited_wei": int(self.total_deposited)}

    @gl.public.view
    def get_refusals(self, count: int) -> typing.Any:
        """What this aggregator refused, and why. The policy made auditable."""
        want = _clamp(_as_int(count, 10), 1, MAX_LOG)
        n = len(self.refusals)
        rows = []
        for i in range(n):
            if len(rows) >= want:
                break
            row = self.refusals[(int(self.refusal_cursor) - 1 - i) % n]
            rows.append({"slug": str(row.slug), "reason": str(row.reason),
                         "verdict": str(row.verdict), "score": int(row.score),
                         "amount_wei": int(row.amount_wei),
                         "at": int(row.at), "who": row.who.as_hex})
        return {"count": len(rows), "total_refusals": int(self.refusal_count),
                "refusals": rows}

    @gl.public.view
    def get_config(self) -> typing.Any:
        return {"owner": self.owner.as_hex, "oracle": self.oracle.as_hex,
                "min_score": int(self.min_score),
                "max_assessment_age_s": int(self.max_assessment_age_s),
                "paused": bool(self.paused),
                "max_positions": MAX_POSITIONS,
                "policy": ("deposits are routed only into protocols DeFiLens "
                           "has scored at or above the floor, whose verdict is "
                           "not HIGH_RISK or UNKNOWN, and whose assessment is "
                           "within the age limit")}

    @gl.public.view
    def get_stats(self) -> typing.Any:
        return {"positions": len(self.slugs),
                "deposits": int(self.deposit_count),
                "refusals": int(self.refusal_count),
                "total_deposited_wei": int(self.total_deposited),
                "total_refused_wei": int(self.total_refused)}

    @gl.public.view
    def balance_of(self, who: str) -> typing.Any:
        return {"address": str(who)[:64],
                "refund_wei": int(self.balances.get(Address(who)) or 0)}
