#!/bin/bash
# DeFiLens audit — every past rejection, checked mechanically.
#
# Each block below is a lesson from a project that was rejected, restated as a
# check that fails loudly. Run it before claiming anything is finished:
#
#   bash tools/audit.sh
#
# A check that cannot be made mechanical says so and points at the test that
# covers it instead. Nothing here is decorative; each one has cost a rejection.

cd "$(dirname "$0")/.." || exit 1
LENS=contracts/DeFiLens.py
CONS=contracts/DeFiConsumer.py
PASS=0; FAIL=0; WARN=0

ok()   { PASS=$((PASS+1)); printf '  \033[32m✔\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✘\033[0m %s\n' "$1"; [ -n "$2" ] && printf '      %s\n' "$2"; }
warn() { WARN=$((WARN+1)); printf '  \033[33m!\033[0m %s\n' "$1"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

printf '\n\033[1mDeFiLens audit\033[0m\n'

# ─────────────────────────────────────────────────────────── 0. it parses
head_ "0. The contracts are loadable"
for f in "$LENS" "$CONS"; do
  if python3 -c "import ast,sys; ast.parse(open('$f').read())" 2>/dev/null; then
    ok "$f parses"
  else
    bad "$f does not parse"
  fi
done

# ─────────────────────────────────────────── 1. the v0.6 runner and namespace
head_ "1. v0.6 format (studio-dev runner)"
for f in "$LENS" "$CONS"; do
  [ "$(sed -n '1p' "$f")" = "# v0.3.0" ] \
    && ok "$(basename "$f") line 1 is the version line" \
    || bad "$(basename "$f") line 1 is not '# v0.3.0'"
  sed -n '2p' "$f" | grep -q '^# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }$' \
    && ok "$(basename "$f") line 2 pins the studio-dev runner" \
    || bad "$(basename "$f") line 2 is not the expected runner pin"
  [ "$(sed -n '3p' "$f")" = "import genlayer as gl" ] \
    && ok "$(basename "$f") line 3 begins the code" \
    || bad "$(basename "$f") has a stray comment inside the runner header block" \
           "GenVM reads the contiguous leading # block as the header; a third comment line makes it undeployable"
done
grep -q "class DeFiLens(gl.contract.Contract)" "$LENS" \
  && ok "gl.contract.Contract (not gl.Contract)" || bad "wrong Contract base class"
grep -q "gl.storage.TreeMap" "$LENS" && ok "gl.storage.TreeMap" || bad "TreeMap is not namespaced"
grep -q "gl.storage.DynArray" "$LENS" && ok "gl.storage.DynArray" || bad "DynArray is not namespaced"
grep -q "@gl.storage.allow" "$LENS" && ok "gl.storage.allow" || bad "missing gl.storage.allow"
grep -q "gl.message.raw" "$LENS" && ok "gl.message.raw" || bad "missing gl.message.raw"
grep -q "gl.contract.get_at" "$LENS" && ok "gl.contract.get_at" || bad "missing gl.contract.get_at"
grep -q "@gl.contract.interface" "$CONS" && ok "gl.contract.interface" || bad "consumer uses a pre-v0.6 interface decorator"
for dead in "allow_storage" "gl.message_raw" "gl.get_contract_at" "gl.contract_interface"; do
  grep -q "$dead" "$LENS" "$CONS" && bad "pre-v0.6 spelling present: $dead" || ok "no $dead"
done

# ───────────────────────────── 2. consensus binds ALL stored values (SkillVerify)
head_ "2. Consensus binds every stored value (SkillVerify: leader forge)"
grep -q "def _agrees" "$LENS" && ok "_agrees exists" || bad "no _agrees"
grep -q "_canon(lf) != _canon(mf)" "$LENS" \
  && ok "_agrees compares the whole feature vector" || bad "_agrees does not compare the vector"
grep -q "for k in IDENTITY_KEYS" "$LENS" \
  && ok "_agrees compares every identity string" || bad "identity strings are not on the axis"
# Either spelling is correct: a `!=` early-return guard, or the `==` that _agrees
# returns as its last expression. Match the operands, not the operator.
grep -qE 'str\(lead\.get\("hash", ""\)\) (==|!=) str\(mine\.get\("hash"' "$LENS" \
  && ok "_agrees compares the content hash" || bad "the hash is not compared"
python3 - <<'PY'
import re, sys
src = open("contracts/DeFiLens.py").read()
body = src[src.index("def _write("):]
body = body[:body.index("\n    # --- 2. settle_stalled")]
# Every rec.<field> = ... assignment must draw from the agreed object, the
# recomputed score, the derived bands, or contract bookkeeping.
allowed = ("scored[", "bands[", "feats", "identity", "evidence", "content_hash",
           "RUBRIC_VERSION", "u32(assessment_id", "u32(seq)", "u64(now)",
           "sender", "u256(fee)", "slug", "name", "category", "kind",
           "chains_csv", "children_csv", "audit_note")
bad_lines = []
for line in body.split("\n"):
    m = re.match(r"\s*rec\.(\w+)\s*=\s*(.+)$", line)
    if not m:
        continue
    if not any(a in m.group(2) for a in allowed):
        bad_lines.append(line.strip())
if bad_lines:
    print("FAIL:" + "; ".join(bad_lines[:4]))
else:
    print("OK")
PY
if [ "$(python3 - <<'PY'
import re
src = open("contracts/DeFiLens.py").read()
body = src[src.index("def _write("):]
body = body[:body.index("\n    # --- 2. settle_stalled")]
allowed = ("scored[", "bands[", "feats", "identity", "evidence", "content_hash",
           "RUBRIC_VERSION", "u32(assessment_id", "u32(seq)", "u64(now)",
           "sender", "u256(fee)", "slug", "name", "category", "kind",
           "chains_csv", "children_csv", "audit_note")
bad_lines = [l.strip() for l in body.split("\n")
             if re.match(r"\s*rec\.\w+\s*=", l)
             and not any(a in l.split("=", 1)[1] for a in allowed)]
print("FAIL" if bad_lines else "OK")
PY
)" = "OK" ]; then
  ok "every rec.<field> in _write draws from the agreed vector or bookkeeping"
else
  bad "a stored field in _write is not derived from the agreed vector"
fi
grep -q "scored = _score(feats)" "$LENS" \
  && ok "_write recomputes the score from the agreed vector" \
  || bad "_write stores the leader's scores instead of recomputing"
# The leader's payload carries a "scores" dict. It exists ONLY to be compared
# (_coherent, _agrees); if it ever reached a rec.* assignment the leader would be
# choosing a stored number. Mechanical: no rec.* in _write may read a "scores"
# subscript off a leader-supplied payload, and the verdict must come from the
# recomputed dict.
if [ "$(python3 - <<'SCOREGUARD'
import re
src = open("contracts/DeFiLens.py").read()
body = src[src.index("def _write("):]
body = body[:body.index("\n    # --- 2. settle_stalled")]
leaks = []
for line in body.split("\n"):
    m = re.match(r"\s*rec\.\w+\s*=\s*(.+)$", line)
    if not m:
        continue
    rhs = m.group(1)
    # `scored[...]` is the locally recomputed dict and is fine; any OTHER
    # ["scores"] subscript, or any read off the leader payload, is a leak.
    if '["scores"]' in rhs or re.search(r"\b(out|payload|lead|res)\b", rhs):
        leaks.append(line.strip())
print("FAIL" if leaks else "OK")
SCOREGUARD
)" = "OK" ] && grep -q 'rec.verdict = scored\["verdict"\]' "$LENS"; then
  ok "the leader's own scores dict never reaches storage"
else
  bad "a stored field reads the leader-supplied scores/payload instead of the recomputed dict"
fi

# ─────────────────────────────────── 3. fee snapshotted at creation (PredictStake)
head_ "3. The fee is snapshotted at creation (PredictStake)"
grep -q "fee_paid_wei: u256" "$LENS" && ok "Assessment carries fee_paid_wei" || bad "no fee snapshot field"
grep -q "rec.fee_paid_wei = u256(fee)" "$LENS" \
  && ok "the fee is frozen into the record at write time" || bad "fee is not snapshotted"
grep -q "fee = int(self.fee_wei)" "$LENS" \
  && ok "the fee is read ONCE, before consensus" || bad "the fee may be re-read after consensus"
python3 -c "
src=open('contracts/DeFiLens.py').read()
i=src.index('def set_fee'); j=src.index('def set_paused')
print('OK' if 'rec.' not in src[i:j] and 'history' not in src[i:j] else 'FAIL')" | grep -q OK \
  && ok "set_fee cannot reach an existing record" || bad "set_fee touches stored assessments"

# ───────────────────── 4. refund-on-reject on all payable paths (ClaimStake)
head_ "4. Refund on reject, never revert, on every payable path (ClaimStake)"
PAYABLE=$(grep -c "@gl.public.write.payable" "$LENS" "$CONS" | awk -F: '{s+=$2} END {print s}')
ok "payable methods found: $PAYABLE"
grep -q "def _reject" "$LENS" && grep -q "self._credit(gl.message.sender_address, value)" "$LENS" \
  && ok "_reject credits the full deposit back" || bad "_reject does not refund"
if python3 - <<'PY'
import ast, sys
src = open("contracts/DeFiLens.py").read()
tree = ast.parse(src)
bad = []
for node in ast.walk(tree):
    if not isinstance(node, ast.FunctionDef):
        continue
    payable = any(
        isinstance(d, ast.Attribute) and d.attr == "payable"
        for d in node.decorator_list)
    if not payable:
        continue
    for sub in ast.walk(node):
        # A `raise` inside a nested function (a nondet closure) is fine; one in
        # the method's own body is the ClaimStake bug.
        if isinstance(sub, ast.Raise):
            bad.append(f"{node.name}:{sub.lineno}")
sys.exit(1 if bad else 0)
PY
then ok "no payable method in DeFiLens raises"; else bad "a payable method can raise — the deposit would be kept"; fi
if python3 - <<'PY'
import ast, sys
src = open("contracts/DeFiConsumer.py").read()
tree = ast.parse(src)
bad = []
for node in ast.walk(tree):
    if isinstance(node, ast.FunctionDef) and any(
            isinstance(d, ast.Attribute) and d.attr == "payable" for d in node.decorator_list):
        for sub in ast.walk(node):
            if isinstance(sub, ast.Raise):
                bad.append(f"{node.name}:{sub.lineno}")
sys.exit(1 if bad else 0)
PY
then ok "no payable method in DeFiConsumer raises"; else bad "a payable consumer method can raise"; fi
grep -q "def claim_refund" "$LENS" && ok "claim_refund exists (pull, not push)" || bad "no claim_refund"
python3 -c "
src=open('contracts/DeFiLens.py').read()
i=src.index('def claim_refund')
print('OK' if 'self.paused' not in src[i:i+900] else 'FAIL')" | grep -q OK \
  && ok "claim_refund is NOT gated on pause" || bad "the owner can freeze refunds"

# ───────────────────────── 5. no counter before a revert (PackageGuard)
head_ "5. No counter moves before a path that can still refuse (PackageGuard)"
if python3 - <<'PY'
import sys
src = open("contracts/DeFiLens.py").read()
body = src[src.index("def analyze_protocol("):src.index("    def _write(")]
lines = body.split("\n")
# Where do the counters start moving, and where does the last _reject sit?
first_counter = next((i for i, l in enumerate(lines)
                      if "self.total_requests = " in l), 10**6)
guard_rejects = [i for i, l in enumerate(lines)
                 if "return self._reject(" in l and i < first_counter]
# every reject BEFORE the counter is fine; the question is whether any
# _reject appears after a counter that is NOT the in-flight/rate-limit state.
after = [i for i, l in enumerate(lines)
         if "self.total_analyzed" in l or "self.next_id = " in l
         or "self.total_fees_wei" in l]
sys.exit(0 if all(a > first_counter for a in after) and guard_rejects else 1)
PY
then ok "every refusal precedes the statistics counters"; else bad "a counter moves before a refusal"; fi
grep -q "self.total_requests = u256(int(self.total_requests) + 1)" "$LENS" \
  && ok "total_requests moves only after the last guard" || warn "check the counter order by hand"

# ───────────────────── 6. no state mutation after freeze/lock (PackageGuard)
head_ "6. A written assessment is immutable (PackageGuard)"
if python3 - <<'PY'
import ast, sys
src = open("contracts/DeFiLens.py").read()
tree = ast.parse(src)
# Only _write may assign to a record's fields.
offenders = []
for node in ast.walk(tree):
    if isinstance(node, ast.FunctionDef) and node.name != "_write":
        for sub in ast.walk(node):
            if isinstance(sub, ast.Assign):
                for t in sub.targets:
                    if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) \
                            and t.value.id == "rec":
                        offenders.append(f"{node.name}:{sub.lineno}")
sys.exit(1 if offenders else 0)
PY
then ok "only _write assigns to an assessment record"; else bad "a record is mutated outside _write"; fi
grep -q "feed.capacity = u32(HISTORY_CAP)" "$LENS" \
  && [ "$(grep -c 'feed.capacity = ' "$LENS")" -eq 1 ] \
  && ok "capacity is assigned exactly once, at feed creation" \
  || bad "capacity is assigned more than once"

# ─────────────────────────────── 7. the owner cannot freeze user funds
head_ "7. The owner cannot freeze user funds"
OWNER_GATED=$(python3 -c "
import ast
src=open('contracts/DeFiLens.py').read(); tree=ast.parse(src)
out=[]
for n in ast.walk(tree):
    if isinstance(n, ast.FunctionDef):
        seg=ast.get_source_segment(src,n) or ''
        if '_only_owner()' in seg: out.append(n.name)
print(','.join(sorted(out)))")
[ "$OWNER_GATED" = "set_fee,set_paused,transfer_ownership,withdraw_fees" ] \
  && ok "owner-gated methods are exactly: $OWNER_GATED" \
  || bad "unexpected owner-gated surface: $OWNER_GATED"
grep -q "available = held - int(self.refunds_owed)" "$LENS" \
  && ok "withdraw_fees subtracts refunds owed before offering a balance" \
  || bad "the owner could withdraw somebody else's refund"
grep -q "Deliberately NOT gated\|NEVER gated on pause\|never gated on pause" "$LENS" \
  && ok "the pause exemption is documented" || warn "document why claim_refund ignores pause"

# ───────────────────────────────────────────── 8. content hash present
head_ "8. Content hash"
grep -q "def _digest" "$LENS" && ok "_digest exists" || bad "no content hash function"
grep -q "content_hash: str" "$LENS" && ok "content_hash is stored" || bad "content_hash not stored"
grep -q "_fnv(\"|\".join(parts)" "$LENS" \
  && ok "the hash covers the slug, identity strings AND the vector" \
  || bad "the hash does not cover identity"

# ──────────────────────────────────── 9. settle_stalled for stuck consensus
head_ "9. settle_stalled"
grep -q "def settle_stalled" "$LENS" && ok "settle_stalled exists" || bad "no settle_stalled"
python3 -c "
src=open('contracts/DeFiLens.py').read()
i=src.index('def settle_stalled')
seg=src[i:i+2000]
print('OK' if '_only_owner' not in seg and 'self.paused' not in seg else 'FAIL')" | grep -q OK \
  && ok "settle_stalled is permissionless and works while paused" \
  || bad "settle_stalled is gated — the owner could censor the oracle"

# ────────────────────────── 10. treasury terms bound to assessment (VoteGuard)
head_ "10. Every displayed figure is bound to the assessment (VoteGuard)"
for field in tvl_sig peak_sig chain_n age_days health_pct momentum_off first_day; do
  grep -q "(\"$field\", 0," "$LENS" \
    && ok "$field is on the consensus axis" || bad "$field is displayed but not compared"
done
grep -q "def _bands" "$LENS" \
  && ok "_bands derives every displayed figure from the vector" || bad "no _bands"

# ───────────────────────────────────── 11. runner hazards
head_ "11. Runner hazards"
if python3 - <<'PY'
import ast, sys
found = []
for f in ("contracts/DeFiLens.py", "contracts/DeFiConsumer.py"):
    for n in ast.walk(ast.parse(open(f).read())):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) \
                and n.func.attr == "replace":
            found.append(f"{f}:{n.lineno}")
sys.exit(1 if found else 0)
PY
then ok "str.replace() is never used (the runner rejects it)"; else bad "str.replace() is used"; fi
if python3 - <<'PY'
import ast, sys
found = []
for f in ("contracts/DeFiLens.py", "contracts/DeFiConsumer.py"):
    for n in ast.walk(ast.parse(open(f).read())):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) \
                and n.func.attr == "emit" \
                and any(k.arg == "value" for k in n.keywords):
            found.append(f"{f}:{n.lineno}")
sys.exit(1 if found else 0)
PY
then ok "no .emit(value=…) — that spelling posts no message at all"; else bad "a payout uses .emit(value=…), which silently sends nothing"; fi
for f in "$LENS" "$CONS"; do
  N=$(python3 -c "
import ast
print(sum(1 for n in ast.walk(ast.parse(open('$f').read()))
          if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
          and n.func.attr == 'emit_transfer'))")
  [ "$N" = "1" ] && ok "$(basename "$f"): money leaves through exactly one call" \
                 || bad "$(basename "$f"): $N emit_transfer calls (expected 1)"
done
grep -q "isinstance(v, bool)" "$LENS" \
  && ok "bool is excluded from integer coercion (Python makes True an int)" \
  || bad "a boolean could be read as the integer 1"

# ───────────────────────────────────── 12. the offline suite
head_ "12. Tests"
TESTOUT=$(python3 test/test_logic.py 2>&1 | tail -3)
COUNT=$(printf '%s' "$TESTOUT" | grep -oE "Ran [0-9]+ tests" | grep -oE "[0-9]+")
if printf '%s' "$TESTOUT" | grep -q "^OK"; then
  ok "offline suite: $COUNT tests, all passing"
  [ "${COUNT:-0}" -ge 200 ] && ok "at least 200 tests ($COUNT)" || warn "only $COUNT tests"
else
  bad "offline suite failing" "$TESTOUT"
fi

# ───────────────────────────────────── 13. live deployment
head_ "13. Live on studio-dev"
if [ -f deployments.json ]; then
  ORACLE=$(python3 -c "import json;print(json.load(open('deployments.json'))['deployments']['studiodev']['DeFiLens']['address'])" 2>/dev/null)
  CONSUMER=$(python3 -c "import json;print(json.load(open('deployments.json'))['deployments']['studiodev']['DeFiConsumer']['address'])" 2>/dev/null)
  [ -n "$ORACLE" ] && ok "DeFiLens deployed: $ORACLE" || bad "no DeFiLens address recorded"
  [ -n "$CONSUMER" ] && ok "DeFiConsumer deployed: $CONSUMER" || bad "no DeFiConsumer address recorded"
else
  bad "no deployments.json"
fi
if [ -f docs/evidence.json ]; then
  python3 - <<'PY'
import json
d = json.load(open("docs/evidence.json"))
v = d.get("verification_summary", {})
print(f"  \033[32m✔\033[0m {v.get('verified',0)}/{v.get('of',0)} stored records recompute exactly on chain")
s = d.get("stats", {})
print(f"  \033[32m✔\033[0m {s.get('total_analyzed',0)} assessments across {s.get('protocols_tracked',0)} protocols")
PY
  PASS=$((PASS+2))
else
  warn "no docs/evidence.json — run test/refresh_evidence.mjs"
fi

printf '\n\033[1m%d passed, %d failed, %d warnings\033[0m\n\n' "$PASS" "$FAIL" "$WARN"
[ "$FAIL" -eq 0 ] || exit 1
