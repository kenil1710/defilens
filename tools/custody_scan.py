#!/usr/bin/env python3
"""Follow the money: where does incoming value LAND, and can anything drain it?

    python3 tools/custody_scan.py contracts/DeFiLens.py contracts/DeFiConsumer.py

Exits non-zero, naming the fields, if any contract writes the incoming message
value into storage that no depositor-callable method can get it back out of.

WHY THIS EXISTS, rather than a check that counts methods. The rejected
DeFiConsumer had a payable `deposit()` AND a public `withdraw()` that really did
post a transfer — so every shallow version of this question answered "yes, there
is a way out" while an accepted deposit was gone for good. The value went into
two places and only one of them was drainable:

    deposit(value)  ──refused──> self.balances[who] += value   ──> withdraw() ✓
                    ──accepted─> pos.amount_wei     += value   ──> nothing

`test_the_scan_catches_the_shape_that_was_rejected` in test/test_logic.py runs
that exact shape through this scanner and asserts it comes back flagged, so the
check is known to reject something rather than merely passing on today's code.

Imported by the offline suite and run by tools/audit.sh; one implementation, so
the audit and the tests cannot drift apart on what "trapped" means.
"""

import ast
import sys
from pathlib import Path


def _is_message_value(node) -> bool:
    """True for the expression `gl.message.value` anywhere inside `node`."""
    for sub in ast.walk(node):
        if isinstance(sub, ast.Attribute) and sub.attr == "value" and \
                isinstance(sub.value, ast.Attribute) and \
                sub.value.attr == "message":
            return True
    return False


def _mentions(node, names: set) -> bool:
    for sub in ast.walk(node):
        if isinstance(sub, ast.Name) and sub.id in names:
            return True
    return False


def _self_attr(node):
    """`self.x` -> "x"; `self.x[k]` -> "x"; anything else -> None."""
    if isinstance(node, ast.Subscript):
        node = node.value
    while isinstance(node, ast.Call):
        node = node.func
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) \
            and node.value.id == "self":
        return node.attr
    if isinstance(node, ast.Attribute):
        return _self_attr(node.value)
    return None


def _methods(tree):
    return {n.name: n for n in ast.walk(tree)
            if isinstance(n, ast.FunctionDef)}


def _is_payable(fn) -> bool:
    return any(isinstance(d, ast.Attribute) and d.attr == "payable"
               for d in fn.decorator_list)


def _decorator_kind(fn):
    """"write", "view" or None, from `@gl.public.write[.payable]`."""
    for d in fn.decorator_list:
        spelling = ast.dump(d)
        if "'write'" in spelling or '"write"' in spelling:
            return "write"
        if "'view'" in spelling or '"view"' in spelling:
            return "view"
    return None


def value_lands_in(src: str) -> set:
    """Every `self.<field>` that a payable method writes the incoming message
    value into — directly, through a local name, through a struct or map handle
    taken out of storage, or through a private helper it hands the value to."""
    tree = ast.parse(src)
    methods = _methods(tree)
    landed = set()
    # (function name, frozenset of tainted parameter names) still to walk.
    queue = [(fn.name, frozenset()) for fn in methods.values() if _is_payable(fn)]
    seen = set()

    while queue:
        name, tainted_params = queue.pop()
        if (name, tainted_params) in seen or name not in methods:
            continue
        seen.add((name, tainted_params))
        fn = methods[name]
        tainted = set(tainted_params)
        handles = {}          # local name -> the storage field it came from

        assigns = [n for n in ast.walk(fn)
                   if isinstance(n, (ast.Assign, ast.AugAssign))]

        def parts(node):
            targets = node.targets if isinstance(node, ast.Assign) \
                else [node.target]
            return targets, node.value

        # Pass one: which local names are handles onto storage. Done first and
        # over the WHOLE function, because `ast.walk` is breadth-first: a
        # handle bound inside an `if` is reached AFTER the top-level line that
        # writes through it, and a single pass would miss the connection.
        for node in assigns:
            targets, rhs = parts(node)
            if _is_message_value(rhs):
                continue
            for t in targets:
                if isinstance(t, ast.Name):
                    from_storage = _self_attr(rhs)
                    if from_storage is not None:
                        handles[t.id] = from_storage

        # Pass two: propagate the taint to a fixed point, for the same reason —
        # `amount = value - fee` may be walked before `value` is known tainted.
        changed = True
        while changed:
            changed = False
            for node in assigns:
                targets, rhs = parts(node)
                if not (_is_message_value(rhs) or _mentions(rhs, tainted)):
                    continue
                for t in targets:
                    if isinstance(t, ast.Name) and t.id not in tainted:
                        tainted.add(t.id)
                        changed = True

        # Pass three: where does a tainted value actually land in storage?
        for node in assigns:
            targets, rhs = parts(node)
            if not (_is_message_value(rhs) or _mentions(rhs, tainted)):
                continue
            for t in targets:
                if isinstance(t, ast.Name):
                    continue
                root = _self_attr(t)
                if root is not None:
                    landed.add(root)
                elif isinstance(t, ast.Attribute):
                    # `row.amount_wei = …` — resolve `row` back to its field.
                    base = t.value
                    if isinstance(base, ast.Subscript):
                        base = base.value
                    if isinstance(base, ast.Name) and base.id in handles:
                        landed.add(handles[base.id])

        # Hand the taint on to the private helpers this method calls.
        for node in ast.walk(fn):
            if not isinstance(node, ast.Call):
                continue
            fnode = node.func
            if not (isinstance(fnode, ast.Attribute)
                    and isinstance(fnode.value, ast.Name)
                    and fnode.value.id == "self"):
                continue
            callee = methods.get(fnode.attr)
            if callee is None:
                continue
            params = [a.arg for a in callee.args.args]
            passed = set()
            for i, arg in enumerate(node.args):
                if _is_message_value(arg) or _mentions(arg, tainted):
                    if i + 1 < len(params):
                        passed.add(params[i + 1])   # +1 skips `self`
            if _is_payable(callee) or passed or _is_message_value(node):
                queue.append((callee.name, frozenset(passed)))
    return landed


def anyone_can_drain(src: str) -> set:
    """Every `self.<field>` read by a public write that ANYONE may call and that
    actually posts a transfer.

    Owner-gated methods are excluded on purpose: a contract that takes value and
    offers the owner the only way out is not refunding, it is collecting."""
    tree = ast.parse(src)
    out = set()
    for fn in _methods(tree).values():
        if _decorator_kind(fn) != "write":
            continue
        body = ast.get_source_segment(src, fn) or ""
        if "_only_owner()" in body:
            continue
        if "_pay(" not in body and "emit_transfer" not in body:
            continue
        for node in ast.walk(fn):
            root = _self_attr(node)
            if root is not None:
                out.add(root)
    return out


def trapped_fields(src: str) -> set:
    """Fields the incoming value lands in that no depositor can drain."""
    return value_lands_in(src) - anyone_can_drain(src)


def main(argv) -> int:
    paths = [Path(a) for a in argv[1:]] or [
        Path("contracts/DeFiLens.py"), Path("contracts/DeFiConsumer.py")]
    failed = 0
    for path in paths:
        src = path.read_text(encoding="utf8")
        lands = sorted(value_lands_in(src))
        drains = sorted(anyone_can_drain(src))
        trapped = sorted(trapped_fields(src))
        print(path.name + ":")
        print("  value lands in : " + (", ".join(lands) or "nothing"))
        print("  anyone can drain: " + (", ".join(drains) or "nothing"))
        if trapped:
            failed = 1
            print("  TRAPPED        : " + ", ".join(trapped))
        else:
            print("  trapped        : none")
    return failed


if __name__ == "__main__":
    sys.exit(main(sys.argv))
