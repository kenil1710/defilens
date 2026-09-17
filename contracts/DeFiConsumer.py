# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import genlayer as gl
from genlayer import *
from dataclasses import dataclass
import typing

# DeFiConsumer — a worked example of reading DeFiLens from another contract.
#
# It models the ADMISSION CONTROL a yield aggregator runs before it moves money,
# and only that. One rule: a protocol is admitted if DeFiLens has scored it, the
# verdict is not HIGH_RISK or UNKNOWN, the score clears this contract's floor,
# and the assessment is not stale. Every decision is recorded with the evidence
# that produced it, so the policy is auditable rather than asserted.
#
# IT HOLDS NO MONEY. There is not a payable method in this file, not a storage
# field denominated in value, and not a transfer anywhere in it. That is a
# deliberate narrowing, and it is worth saying why.
#
#   An earlier version took custody. `deposit()` was payable: it refused and
#   refunded bad protocols, and for good ones it added the value to a position
#   and returned {"status": "OK"}. The refund path worked. The ACCEPTED path had
#   no exit at all — `withdraw()` paid out of the refusal ledger, which an
#   accepted deposit never touched, so a depositor whose deposit SUCCEEDED could
#   never get it back. Succeeding was the way to lose your money. Every refusal
#   test passed, because every refusal really did refund; nothing tested the
#   other half.
#
#   The fix is not a withdraw() for positions. It is that a contract whose
#   entire job is to READ AN ORACLE has no business holding value in the first
#   place. Custody was never part of the demonstration — it was scaffolding that
#   made the demonstration look bigger, and it carried the one risk that scaffold
#   should never carry. So the custody is gone and the claims are narrowed to
#   what the contract actually does: it reads, it decides, it records.
#
# What is left is the part that was always the point:
#
#   1. IT TREATS THE ORACLE AS UNTRUSTED-BY-DEFAULT. `get_risk_summary` never
#      raises, so the happy path never depends on catching an exception, and
#      every field it returns is checked here before it is used. A consumer that
#      assumed `found` was true would treat "never analysed" as a score of zero
#      — or worse, as a pass.
#
#   2. IT PINS THE ASSESSMENT IT ACTED ON. Every recorded decision keeps the
#      assessment id, the content hash and the verdict that produced it. A
#      protocol that later degrades does not rewrite history, and an auditor can
#      ask "what did you know when you admitted it" and get an answer.
#
#   3. IT HAS A STALENESS RULE. A SAFE verdict from a year ago is not evidence
#      about today. `max_assessment_age_s` is the consumer's own policy, not the
#      oracle's, which is the right place for it: the oracle reports what it
#      measured and when, and each integrator decides how old is too old.
#
#   4. ONE POLICY, EVALUATED IN ONE PLACE. `check()` (a view) and
#      `record_check()` (a write) both call `_decide`, so the answer a reader
#      previews and the answer the chain records cannot drift apart. The earlier
#      version spelled the same five rules out twice.

ERR_EXPECTED = "[EXPECTED]"

V_SAFE = "SAFE"
V_MODERATE = "MODERATE"
V_HIGH_RISK = "HIGH_RISK"
V_UNKNOWN = "UNKNOWN"

# Defaults. Both are constructor arguments so a deployer can state their own
# risk appetite rather than inherit one.
DEFAULT_MIN_SCORE = 55
DEFAULT_MAX_AGE_S = 7 * 24 * 3600
MAX_TRACKED = 200
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


@gl.contract.interface
class IDeFiLens:
    """The read surface DeFiConsumer depends on.

    DELIBERATELY NARROW: `get_risk_summary` is the only method here, because it
    is the only one that never raises. `require_safe` would be shorter to call
    and would make every refusal a revert, which turns a routine "we have not
    scored that one" into a failed transaction for the caller."""

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
class Decision:
    """The latest admission decision for a protocol, and THE EVIDENCE BEHIND IT.

    No value fields. This record says what the gate decided and what it knew
    when it decided; it does not say that anything was paid, because nothing
    was."""
    slug: str
    name: str
    category: str
    allowed: bool
    checks: u32
    admits: u32
    verdict_at_decision: str
    score_at_decision: u32
    assessment_id: u32
    content_hash: str
    reason: str
    first_checked_at: u64
    last_checked_at: u64


@gl.storage.allow
@dataclass
class Refusal:
    """A refused protocol, kept so the policy is auditable rather than asserted."""
    slug: str
    reason: str
    verdict: str
    score: u32
    at: u64
    who: Address


class DeFiConsumer(gl.contract.Contract):
    owner: Address
    oracle: Address
    min_score: u32
    max_assessment_age_s: u64
    paused: bool

    decisions: gl.storage.TreeMap[str, Decision]
    slugs: gl.storage.DynArray[str]
    refusals: gl.storage.DynArray[Refusal]
    refusal_cursor: u32

    check_count: u32
    admit_count: u32
    refusal_count: u32

    def __init__(self, oracle: str, min_score: int = DEFAULT_MIN_SCORE,
                 max_age_s: int = DEFAULT_MAX_AGE_S):
        self.owner = gl.message.sender_address
        # An unusable oracle address is fatal HERE and only here. A consumer
        # deployed against a contract that cannot answer is a consumer whose
        # every check would be refused, which is worse than a failed deploy.
        self.oracle = Address(oracle)
        self.min_score = u32(_clamp(_as_int(min_score, DEFAULT_MIN_SCORE), 0, 100))
        self.max_assessment_age_s = u64(max(0, _as_int(max_age_s,
                                                       DEFAULT_MAX_AGE_S)))
        self.paused = False
        self.check_count = u32(0)
        self.admit_count = u32(0)
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

    def _decide(self, protocol_slug: str) -> dict:
        """THE WHOLE POLICY, IN ONE PLACE.

        Both the view and the write go through here, so what a reader previews
        and what the chain records are produced by the same code rather than by
        two copies of five rules that drift apart on the sixth edit.

        Never raises. An oracle that is down, absent or nonsensical is a
        REFUSAL with a reason, not an exception thrown at the caller."""
        slug = str(protocol_slug).strip().lower()[:80]
        out = {"allowed": False, "slug": slug, "name": "", "category": "",
               "verdict": V_UNKNOWN, "score": 0,
               "min_score": int(self.min_score),
               "assessment_age_s": -1,
               "max_assessment_age_s": int(self.max_assessment_age_s),
               "assessment_id": 0, "content_hash": "",
               "paused": bool(self.paused), "reason": ""}

        try:
            summary = self._ask(slug)
        except Exception as e:
            out["reason"] = "the risk oracle did not answer: " + str(e)[:120]
            return out
        if not isinstance(summary, dict):
            out["reason"] = "the risk oracle returned an unusable answer"
            return out

        verdict = str(summary.get("verdict", V_UNKNOWN))
        score = _clamp(_as_int(summary.get("overall_score"), 0), 0, 100)
        age = _as_int(summary.get("age_of_assessment_s"), -1)
        limit = int(self.max_assessment_age_s)
        out["verdict"] = verdict
        out["score"] = score
        out["assessment_age_s"] = age
        out["name"] = str(summary.get("name", ""))[:80]
        out["category"] = str(summary.get("category", ""))[:60]
        out["assessment_id"] = _as_int(summary.get("assessment_id"), 0)
        out["content_hash"] = str(summary.get("content_hash", ""))[:80]

        # Pause first: a paused gate admits nothing, whatever the oracle says.
        if self.paused:
            out["reason"] = "this gate is paused"
        elif not summary.get("found"):
            out["reason"] = ("no DeFiLens assessment exists for this protocol — "
                             "call analyze_protocol('" + slug + "') on the "
                             "oracle first")
        elif verdict == V_HIGH_RISK:
            out["reason"] = "DeFiLens rates this HIGH_RISK"
        elif verdict == V_UNKNOWN:
            out["reason"] = "DeFiLens could not score this protocol"
        elif score < int(self.min_score):
            out["reason"] = ("scored " + str(score) + "/100, below this gate's "
                             "floor of " + str(int(self.min_score)))
        elif limit > 0 and age >= 0 and age > limit:
            out["reason"] = ("the assessment is " + str(age) + "s old; this "
                             "gate requires one no older than " + str(limit)
                             + "s")
        else:
            out["allowed"] = True
            out["reason"] = "allowed"
        return out

    def _log_refusal(self, decision: dict, now: int) -> None:
        """Append to the refusal ring.

        A ring rather than a list: a consumer that a stranger could make grow
        storage without bound by checking ten thousand invented slugs is a
        consumer with a denial-of-service in it."""
        if len(self.refusals) < MAX_LOG:
            row = self.refusals.append_new_get()
        else:
            row = self.refusals[int(self.refusal_cursor) % MAX_LOG]
        row.slug = str(decision["slug"])[:80]
        row.reason = str(decision["reason"])[:200]
        row.verdict = str(decision["verdict"])
        row.score = u32(_clamp(int(decision["score"]), 0, 100))
        row.at = u64(now)
        row.who = gl.message.sender_address
        self.refusal_cursor = u32((int(self.refusal_cursor) + 1) % MAX_LOG)

    # --- the product -------------------------------------------------------

    @gl.public.write
    def record_check(self, protocol_slug: str) -> typing.Any:
        """Run the gate against a protocol and RECORD what it decided.

        NOT PAYABLE. This contract takes no custody of anything: it reads the
        oracle, applies its own policy, and writes down the answer with the
        evidence behind it. An integrator wires their own money movement to the
        `allowed` field; that decision, and the funds, stay on their side.

        Never raises. Every outcome — admitted, refused, oracle unreachable — is
        a status object, because a gate that reverts makes "we have not scored
        that one" indistinguishable from a bug for the contract calling it."""
        now = self._now()
        decision = self._decide(protocol_slug)
        slug = str(decision["slug"])
        self._record(decision, now)
        self.check_count = u32(int(self.check_count) + 1)

        if not decision["allowed"]:
            self._log_refusal(decision, now)
            self.refusal_count = u32(int(self.refusal_count) + 1)
            return {"status": "REFUSED", "slug": slug,
                    "reason": str(decision["reason"]),
                    "verdict": str(decision["verdict"]),
                    "score": int(decision["score"]),
                    "assessment_id": int(decision["assessment_id"]),
                    "content_hash": str(decision["content_hash"])}

        self.admit_count = u32(int(self.admit_count) + 1)
        return {"status": "ADMITTED", "slug": slug,
                "verdict": str(decision["verdict"]),
                "score": int(decision["score"]),
                "assessment_id": int(decision["assessment_id"]),
                "content_hash": str(decision["content_hash"]),
                "reason": str(decision["reason"])}

    def _record(self, decision: dict, now: int) -> None:
        """Write the decision down, pinning the evidence that produced it.

        Bounded the same way the refusal log is: a new slug past MAX_TRACKED is
        decided and logged but not tracked, so a stranger cannot grow this map
        without limit. The decision still went back to the caller — only the
        bookkeeping is capped."""
        slug = str(decision["slug"])
        if slug == "":
            return
        if slug not in self.decisions and len(self.slugs) >= MAX_TRACKED:
            return
        rec = self.decisions.get_or_insert_default(slug)
        if str(rec.slug) == "":
            rec.slug = slug
            rec.first_checked_at = u64(now)
            self.slugs.append(slug)
        rec.name = str(decision["name"])[:80]
        rec.category = str(decision["category"])[:60]
        rec.allowed = bool(decision["allowed"])
        rec.checks = u32(int(rec.checks) + 1)
        if decision["allowed"]:
            rec.admits = u32(int(rec.admits) + 1)
        # The evidence behind THIS decision, pinned. A protocol that later
        # degrades does not rewrite the record of what was known at the time.
        rec.verdict_at_decision = str(decision["verdict"])
        rec.score_at_decision = u32(_clamp(int(decision["score"]), 0, 100))
        rec.assessment_id = u32(max(0, int(decision["assessment_id"])))
        rec.content_hash = str(decision["content_hash"])[:80]
        rec.reason = str(decision["reason"])[:200]
        rec.last_checked_at = u64(now)

    @gl.public.write
    def set_policy(self, min_score: int, max_age_s: int) -> typing.Any:
        """The gate's own risk appetite. It cannot change the oracle's verdicts,
        only how strictly this contract reads them."""
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
        """Pause the gate. It admits nothing while paused.

        There is no user money in this contract for a pause to strand — that is
        the point of holding none. Reads keep working either way."""
        self._only_owner()
        self.paused = bool(value)
        return {"status": "OK", "paused": bool(self.paused)}

    # --- reads -------------------------------------------------------------

    @gl.public.view
    def check(self, protocol_slug: str) -> typing.Any:
        """Would this protocol be admitted, and why?

        The whole policy, evaluated without writing anything. An integrator
        should never have to send a transaction to find out that they cannot."""
        return self._decide(protocol_slug)

    @gl.public.view
    def get_decision(self, protocol_slug: str) -> typing.Any:
        slug = str(protocol_slug).strip().lower()[:80]
        rec = self.decisions.get(slug)
        if rec is None or str(rec.slug) == "":
            return {"found": False, "slug": slug, "allowed": False,
                    "checks": 0}
        return self._decision_view(rec)

    def _decision_view(self, rec: Decision) -> dict:
        return {"found": True, "slug": str(rec.slug), "name": str(rec.name),
                "category": str(rec.category),
                "allowed": bool(rec.allowed),
                "checks": int(rec.checks),
                "admits": int(rec.admits),
                "verdict_at_decision": str(rec.verdict_at_decision),
                "score_at_decision": int(rec.score_at_decision),
                "assessment_id": int(rec.assessment_id),
                "content_hash": str(rec.content_hash),
                "reason": str(rec.reason),
                "first_checked_at": int(rec.first_checked_at),
                "last_checked_at": int(rec.last_checked_at)}

    @gl.public.view
    def get_decisions(self) -> typing.Any:
        rows = []
        for i in range(len(self.slugs)):
            rec = self.decisions.get(str(self.slugs[i]))
            if rec is not None and str(rec.slug) != "":
                rows.append(self._decision_view(rec))
        return {"count": len(rows), "decisions": rows,
                "admitted": len([r for r in rows if r["allowed"]])}

    @gl.public.view
    def get_refusals(self, count: int) -> typing.Any:
        """What this gate refused, and why. The policy made auditable."""
        want = _clamp(_as_int(count, 10), 1, MAX_LOG)
        n = len(self.refusals)
        rows = []
        for i in range(n):
            if len(rows) >= want:
                break
            row = self.refusals[(int(self.refusal_cursor) - 1 - i) % n]
            rows.append({"slug": str(row.slug), "reason": str(row.reason),
                         "verdict": str(row.verdict), "score": int(row.score),
                         "at": int(row.at), "who": row.who.as_hex})
        return {"count": len(rows), "total_refusals": int(self.refusal_count),
                "refusals": rows}

    @gl.public.view
    def get_config(self) -> typing.Any:
        return {"owner": self.owner.as_hex, "oracle": self.oracle.as_hex,
                "min_score": int(self.min_score),
                "max_assessment_age_s": int(self.max_assessment_age_s),
                "paused": bool(self.paused),
                "max_tracked": MAX_TRACKED,
                "custody": False,
                "policy": ("a protocol is admitted only if DeFiLens has scored "
                           "it at or above the floor, its verdict is not "
                           "HIGH_RISK or UNKNOWN, and its assessment is within "
                           "the age limit. This contract decides and records; "
                           "it never takes custody of funds.")}

    @gl.public.view
    def get_stats(self) -> typing.Any:
        return {"tracked": len(self.slugs),
                "checks": int(self.check_count),
                "admits": int(self.admit_count),
                "refusals": int(self.refusal_count),
                "holds_value": False}
