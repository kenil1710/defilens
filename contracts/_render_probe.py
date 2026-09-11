# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import genlayer as gl
from genlayer import *

import json

# Throwaway diagnostic, NOT part of DeFiLens. It answers the questions that
# decide the whole project before a line of scoring is written:
#
#   1. Does validator egress reach api.llama.fi at all?
#   2. How big is /protocols, and does it fit through a GenVM nondet return?
#   3. What is the exact SHAPE of a /protocol/{slug} document — which keys carry
#      TVL, chains, category, and the historical series the maturity and
#      momentum dimensions need?
#   4. Do two different protocols (aave, gmx) answer with the SAME shape, or
#      does the schema vary per protocol?
#
# Every extraction rule in DeFiLens is written against the bodies this captures,
# never against assumptions about DeFi Llama's schema.
#
# The two header lines above are the whole of what GenVM reads before the code:
# the version line and the runner pin, in that order. Nothing else may sit
# between line 1 and the imports — GenVM parses the contiguous leading `#` block
# as the runner header, and a stray comment there makes the contract
# undeployable with no error reported but `invalid_contract`.


def _status(res) -> int:
	s = getattr(res, "status_code", None)
	if s is None:
		s = getattr(res, "status", None)
	if s is None:
		return 0
	return int(s)


def _body(res) -> str:
	b = getattr(res, "body", None)
	if b is None:
		b = getattr(res, "text", None)
	if b is None:
		return ""
	if isinstance(b, bytes):
		return b.decode("utf-8", errors="ignore")
	return str(b)


def _fetch(url: str) -> tuple:
	"""(status, body). Tries web.request first and falls back to web.get: prior
	projects split between the two spellings and the probe must not die on which
	one this runner build happens to expose."""
	try:
		res = gl.nondet.web.request(url, method="GET")
	except AttributeError:
		res = gl.nondet.web.get(url)
	return _status(res), _body(res)


def _safe(v):
	"""Anything a nondet return may legally carry.

	MEASURED: a `float` in a nondet return is NOT calldata encodable — the probe
	died with `TypeError: not calldata encodable 17270822091.14536: float` on
	`key 'tvl'`. Every number that crosses the consensus boundary must therefore
	be an int, a str or a bool first. DeFiLens carries whole USD as int and
	nothing else.
	"""
	if isinstance(v, bool):
		return v
	if isinstance(v, int):
		return v
	if isinstance(v, float):
		return int(v)
	if isinstance(v, str):
		return v[:200]
	if isinstance(v, list):
		return [_safe(x) for x in v[:30]]
	if isinstance(v, dict):
		out = {}
		for k in list(v.keys())[:30]:
			out[str(k)] = _safe(v[k])
		return out
	return str(v)[:200]


def _describe(d) -> dict:
	"""A document's SHAPE rather than its bytes: every top-level key with its
	type and a short sample. A 6 MB protocol list shown 200 characters at a time
	takes a hundred transactions to understand; its key list takes one."""
	out = {}
	if not isinstance(d, dict):
		return {"_type": type(d).__name__}
	for k in sorted(d.keys()):
		v = d[k]
		if isinstance(v, dict):
			inner = sorted([str(x) for x in v.keys()])
			out[str(k)] = "dict{" + ",".join(inner[:16]) + "}(" + str(len(inner)) + ")"
		elif isinstance(v, list):
			kind = ""
			if len(v) > 0:
				if isinstance(v[0], dict):
					kind = "dict{" + ",".join(sorted([str(x) for x in v[0].keys()])[:16]) + "}"
				else:
					kind = str(type(v[0]).__name__) + "=" + str(v[0])[:60]
			out[str(k)] = "list[" + str(len(v)) + "] of " + kind
		else:
			out[str(k)] = str(type(v).__name__) + "=" + str(v)[:120]
	return out


class RenderProbe(gl.contract.Contract):
	url: str
	text: str
	text_len: u32
	statuses: str

	def __init__(self):
		self.url = ""
		self.text = ""
		self.text_len = u32(0)
		self.statuses = ""

	@gl.public.write
	def probe_statuses(self, urls: list) -> None:
		"""HTTP status + body length for each plain GET, one transaction.

		Distinguishes 'blocked' from 'empty' — a 403 is an egress block, a 200
		with a 40-byte body is an endpoint that exists but says nothing, and the
		two call for opposite pivots."""
		targets = [str(u) for u in urls][:10]

		def leader_fn() -> dict:
			found = {}
			for u in targets:
				try:
					st, body = _fetch(u)
					found[u] = {"status": st, "len": len(body), "head": body[:200]}
				except Exception as e:
					found[u] = {"status": -1, "len": -1, "err": str(e)[:200]}
			return found

		def validator_fn(leader_result) -> bool:
			# Shape only. A validator that re-fetched would disagree on every
			# live TVL figure and the probe would never commit — which is the
			# whole reason DeFiLens itself agrees on BUCKETS, not on bytes.
			return isinstance(leader_result, gl.vm.Return)

		self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

	@gl.public.write
	def probe_keys(self, url: str) -> None:
		"""The document's shape: top-level keys with type and sample, plus the
		same for the first element of whichever list the payload carries.

		This is what the extraction rules actually get written against."""

		def leader_fn() -> dict:
			st, body = _fetch(url)
			try:
				doc = json.loads(body)
			except ValueError:
				return {"status": st, "len": len(body), "err": "unparseable",
					"head": body[:400]}

			info = {"status": st, "len": len(body)}
			if isinstance(doc, dict):
				info["top"] = _describe(doc)
				for lk in ("protocols", "items", "result", "data"):
					rows = doc.get(lk)
					if isinstance(rows, list) and len(rows) > 0:
						info["list_key"] = lk
						info["list_len"] = len(rows)
						info["item0"] = _describe(rows[0])
						break
			elif isinstance(doc, list):
				info["top"] = "list[" + str(len(doc)) + "]"
				if len(doc) > 0:
					info["item0"] = _describe(doc[0])
					if len(doc) > 1:
						info["item1"] = _describe(doc[1])
			return info

		def validator_fn(leader_result) -> bool:
			return isinstance(leader_result, gl.vm.Return)

		self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

	@gl.public.write
	def probe_get(self, url: str, start: int, count: int) -> None:
		"""Raw GET, keeping a WINDOW of the body.

		Windowed rather than whole: /protocols is megabytes and the interesting
		parts are found by walking the window forward across calls rather than by
		pushing the page through consensus."""
		begin = int(start)
		span = int(count)
		if span <= 0 or span > 12000:
			span = 12000

		def leader_fn() -> dict:
			st, body = _fetch(url)
			return {"len": len(body), "status": st,
				"window": body[begin:begin + span]}

		def validator_fn(leader_result) -> bool:
			return isinstance(leader_result, gl.vm.Return)

		out = gl.vm.run_nondet(leader_fn, validator_fn)
		self.url = str(url) + " [status " + str(out["status"]) + "]"
		self.text_len = u32(int(out["len"]))
		self.text = str(out["window"])

	@gl.public.write
	def probe_extract(self, url: str) -> None:
		"""The exact numbers DeFiLens' five dimensions would read, pulled from a
		live /protocol/{slug} document.

		This is the probe's real payload. probe_keys says the schema EXISTS;
		this says the schema is USABLE — that a current TVL, a peak TVL, a chain
		count, a first-datapoint timestamp and a 30-day delta can all be derived
		from one fetch, deterministically, by pure Python."""

		def leader_fn() -> dict:
			st, body = _fetch(url)
			if st != 200:
				return {"status": st, "err": "non-200", "head": body[:300]}
			try:
				doc = json.loads(body)
			except ValueError:
				return {"status": st, "err": "unparseable", "head": body[:300]}
			if not isinstance(doc, dict):
				return {"status": st, "err": "not an object"}

			out = {"status": st, "len": len(body)}
			out["name"] = str(doc.get("name", ""))[:60]
			out["slug"] = str(doc.get("slug", ""))[:60]
			out["category"] = str(doc.get("category", ""))[:60]
			out["audits"] = str(doc.get("audits", ""))[:20]
			out["audit_note"] = str(doc.get("audit_note", ""))[:200]
			out["listedAt"] = str(doc.get("listedAt", ""))[:30]

			chains = doc.get("chains")
			if isinstance(chains, list):
				out["chain_count"] = len(chains)
				out["chains"] = [str(c)[:24] for c in chains][:20]

			ct = doc.get("currentChainTvls")
			if isinstance(ct, dict):
				out["currentChainTvls_keys"] = sorted([str(k) for k in ct.keys()])[:20]
				out["currentChainTvls_n"] = len(ct)

			# The historical series. THE dimension that decides whether maturity
			# and momentum are computable at all.
			series = doc.get("tvl")
			if isinstance(series, list):
				out["tvl_points"] = len(series)
				if len(series) > 0:
					out["tvl_first"] = _safe(series[0])
					out["tvl_last"] = _safe(series[-1])
				if len(series) > 31:
					out["tvl_minus30"] = _safe(series[-31])
				# peak
				peak = 0.0
				peak_at = 0
				for p in series:
					if isinstance(p, dict):
						v = p.get("totalLiquidityUSD")
						d = p.get("date")
						if isinstance(v, (int, float)) and float(v) > peak:
							peak = float(v)
							peak_at = int(d) if isinstance(d, (int, float)) else 0
				out["peak_tvl"] = int(peak)
				out["peak_at"] = int(peak_at)
			elif isinstance(series, (int, float)):
				out["tvl_scalar"] = int(series)
			return out

		def validator_fn(leader_result) -> bool:
			return isinstance(leader_result, gl.vm.Return)

		self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

	@gl.public.write
	def probe_list_shape(self, url: str) -> None:
		"""What ONE row of /protocols looks like, and how many rows there are.

		The list is the autocomplete source and the category map. If it is too
		large to pull through a nondet return, the contract must fetch
		/protocol/{slug} directly and never touch the list — which is a design
		decision, not a detail."""

		def leader_fn() -> dict:
			st, body = _fetch(url)
			if st != 200:
				return {"status": st, "err": "non-200", "len": len(body)}
			try:
				doc = json.loads(body)
			except ValueError:
				return {"status": st, "err": "unparseable", "len": len(body)}
			if not isinstance(doc, list):
				return {"status": st, "err": "not a list", "len": len(body)}

			cats = {}
			slugs = []
			for row in doc:
				if not isinstance(row, dict):
					continue
				c = str(row.get("category", ""))
				cats[c] = int(cats.get(c, 0)) + 1
				s = row.get("slug")
				if isinstance(s, str) and len(slugs) < 25:
					slugs.append(s)
			return {"status": st, "len": len(body), "rows": len(doc),
				"item0": _describe(doc[0]) if len(doc) > 0 else {},
				"categories": cats, "sample_slugs": slugs}

		def validator_fn(leader_result) -> bool:
			return isinstance(leader_result, gl.vm.Return)

		self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

	@gl.public.write
	def probe_lite_row(self, url: str, want: str) -> None:
		"""THE load-bearing question: can a validator pull a MULTI-MEGABYTE list
		through json.loads and reduce it to one row, inside the execution budget?

		/lite/protocols2 is 6.7 MB and carries category, chains, listedAt and
		tvl/tvlPrevDay/tvlPrevWeek/tvlPrevMonth — every input four of DeFiLens'
		five dimensions need, in one fetch. If this answers, the contract has a
		data path. If it dies, the whole design changes, and better to learn that
		here than at scoring time."""
		target = str(want).strip().lower()

		def leader_fn() -> dict:
			st, body = _fetch(url)
			if st != 200:
				return {"status": st, "err": "non-200", "len": len(body)}
			out = {"status": st, "len": len(body)}
			try:
				doc = json.loads(body)
			except ValueError:
				out["err"] = "unparseable"
				return out
			out["parsed"] = True
			rows = doc.get("protocols") if isinstance(doc, dict) else doc
			if not isinstance(rows, list):
				out["err"] = "no protocols list"
				return out
			out["rows"] = len(rows)
			if isinstance(doc, dict):
				out["top_keys"] = sorted([str(k) for k in doc.keys()])
				pp = doc.get("parentProtocols")
				if isinstance(pp, list):
					out["parents"] = len(pp)
					if len(pp) > 0:
						out["parent0"] = _describe(pp[0])
				cats = doc.get("protocolCategories")
				if isinstance(cats, list):
					out["categories"] = sorted([str(c) for c in cats])
			hit = None
			for row in rows:
				if not isinstance(row, dict):
					continue
				nm = str(row.get("name", "")).strip().lower()
				if nm == target or nm.replace(" ", "-") == target:
					hit = row
					break
			if hit is None:
				out["found"] = False
				out["sample_names"] = [str(r.get("name", "")) for r in rows[:12]
					if isinstance(r, dict)]
				return out
			out["found"] = True
			out["row_keys"] = sorted([str(k) for k in hit.keys()])
			for k in ("name", "category", "listedAt", "tvl", "tvlPrevDay",
					"tvlPrevWeek", "tvlPrevMonth", "parentProtocol",
					"defillamaId", "symbol", "url"):
				if k in hit:
					out[k] = _safe(hit[k])
			ch = hit.get("chains")
			if isinstance(ch, list):
				out["chain_count"] = len(ch)
				out["chains"] = [str(c)[:24] for c in ch][:25]
			return out

		def validator_fn(leader_result) -> bool:
			return isinstance(leader_result, gl.vm.Return)

		self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

	@gl.public.write
	def probe_size_ladder(self, urls: list) -> None:
		"""How big a body can a validator actually FETCH and PARSE?

		A status-only probe answers 200 for a document the VM then dies parsing,
		so this reports three separate facts per URL — fetched, length, parsed —
		and never lets one dead URL take the whole ladder down with it."""
		targets = [str(u) for u in urls][:8]

		def leader_fn() -> dict:
			found = {}
			for u in targets:
				row = {}
				try:
					st, body = _fetch(u)
					row["status"] = st
					row["len"] = len(body)
					try:
						doc = json.loads(body)
						row["parsed"] = True
						if isinstance(doc, list):
							row["kind"] = "list[" + str(len(doc)) + "]"
						elif isinstance(doc, dict):
							row["kind"] = "dict{" + str(len(doc)) + "}"
						else:
							row["kind"] = type(doc).__name__
					except ValueError:
						row["parsed"] = False
				except Exception as e:
					row["status"] = -1
					row["err"] = str(e)[:180]
				found[u] = row
			return found

		def validator_fn(leader_result) -> bool:
			return isinstance(leader_result, gl.vm.Return)

		self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

	@gl.public.write
	def probe_resolve(self, slug: str) -> None:
		"""THE design probe. Runs the exact two-fetch resolution DeFiLens would
		use, on a live slug, and reports every input the five dimensions need.

		The hard case it exists to settle: `aave` is NOT a row in /protocols.
		DeFi Llama models it as a PARENT whose children (aave-v3, aave-v2, …)
		carry the category and chains, while /protocol/aave carries a TVL history
		for the family as a whole. A resolver that only looks for an exact slug
		match therefore rejects the single most recognisable protocol in DeFi.

		So: exact child match first, parent aggregation second, reject third —
		and this measures whether the aggregation is even well defined.
		"""
		want = str(slug).strip().lower()

		def leader_fn() -> dict:
			out = {"slug": want}

			# ── fetch 1: the list, for category / chains / listedAt.
			st1, body1 = _fetch("https://api.llama.fi/protocols")
			out["list_status"] = st1
			out["list_len"] = len(body1)
			if st1 != 200:
				out["err"] = "list unavailable"
				return out
			try:
				rows = json.loads(body1)
			except ValueError:
				out["err"] = "list unparseable"
				return out
			if not isinstance(rows, list):
				out["err"] = "list not a list"
				return out

			exact = None
			children = []
			for row in rows:
				if not isinstance(row, dict):
					continue
				if str(row.get("slug", "")).lower() == want:
					exact = row
				if str(row.get("parentProtocolSlug", "")).lower() == want:
					children.append(row)

			if exact is not None:
				out["kind"] = "child"
				out["name"] = str(exact.get("name", ""))[:80]
				out["category"] = str(exact.get("category", ""))[:60]
				out["tvl"] = _safe(exact.get("tvl", 0))
				out["listedAt"] = _safe(exact.get("listedAt", 0))
				out["audits"] = str(exact.get("audits", ""))[:8]
				out["parent"] = str(exact.get("parentProtocolSlug", ""))[:60]
				ch = exact.get("chains")
				out["chain_count"] = len(ch) if isinstance(ch, list) else 0
				out["chains"] = [str(c)[:24] for c in ch][:25] if isinstance(ch, list) else []
				out["change_1d"] = _safe(exact.get("change_1d", 0))
				out["change_7d"] = _safe(exact.get("change_7d", 0))
			elif len(children) > 0:
				out["kind"] = "parent"
				out["child_count"] = len(children)
				out["child_slugs"] = [str(c.get("slug", ""))[:40] for c in children][:12]
				# Category by CHILD TVL WEIGHT, not by count: a family with six
				# dead forks and one live lending market is a lending protocol.
				weight = {}
				chains = []
				listed = 0
				total = 0.0
				for c in children:
					cat = str(c.get("category", ""))
					tv = c.get("tvl")
					tv = float(tv) if isinstance(tv, (int, float)) else 0.0
					total += tv
					weight[cat] = float(weight.get(cat, 0.0)) + tv
					cc = c.get("chains")
					if isinstance(cc, list):
						for x in cc:
							if str(x) not in chains:
								chains.append(str(x))
					la = c.get("listedAt")
					if isinstance(la, int) and la > 0 and (listed == 0 or la < listed):
						listed = la
				# Deterministic tie-break: weight desc, then name asc.
				best = ""
				best_w = -1.0
				for cat in sorted(weight.keys()):
					if weight[cat] > best_w:
						best_w = weight[cat]
						best = cat
				out["category"] = best[:60]
				out["category_weights"] = {k: int(weight[k]) for k in sorted(weight.keys())[:12]}
				out["tvl"] = int(total)
				out["listedAt"] = listed
				out["chain_count"] = len(chains)
				out["chains"] = [c[:24] for c in chains][:25]
			else:
				out["kind"] = "unknown"
				near = []
				for row in rows:
					if not isinstance(row, dict):
						continue
					sl = str(row.get("slug", "")).lower()
					if want and want in sl and len(near) < 8:
						near.append(sl)
				out["near"] = near
				return out

			# ── fetch 2: the detail doc, for peak TVL and the 30-day delta.
			st2, body2 = _fetch("https://api.llama.fi/protocol/" + want)
			out["detail_status"] = st2
			out["detail_len"] = len(body2)
			if st2 != 200:
				out["detail_err"] = "non-200"
				return out
			try:
				doc = json.loads(body2)
			except ValueError:
				out["detail_err"] = "unparseable"
				return out
			if not isinstance(doc, dict):
				out["detail_err"] = "not an object"
				return out
			out["detail_name"] = str(doc.get("name", ""))[:80]
			out["detail_category"] = str(doc.get("category", ""))[:60]
			out["isParent"] = bool(doc.get("isParentProtocol", False))
			series = doc.get("tvl")
			if not isinstance(series, list):
				out["detail_err"] = "no tvl series"
				return out
			out["points"] = len(series)
			peak = 0.0
			peak_at = 0
			first_at = 0
			last_v = 0.0
			last_at = 0
			for p in series:
				if not isinstance(p, dict):
					continue
				v = p.get("totalLiquidityUSD")
				d = p.get("date")
				v = float(v) if isinstance(v, (int, float)) else 0.0
				d = int(d) if isinstance(d, (int, float)) else 0
				if first_at == 0 and d > 0:
					first_at = d
				if v > peak:
					peak = v
					peak_at = d
				last_v = v
				last_at = d
			out["peak_tvl"] = int(peak)
			out["peak_at"] = peak_at
			out["first_at"] = first_at
			out["last_at"] = last_at
			out["last_tvl"] = int(last_v)
			# 30 days back by DATE, not by index: the series is not guaranteed to
			# be one point per day for its whole life, and counting backwards 30
			# slots silently measures a different window for an older protocol.
			cutoff = last_at - 30 * 86400
			ref = 0.0
			ref_at = 0
			for p in series:
				if not isinstance(p, dict):
					continue
				d = p.get("date")
				d = int(d) if isinstance(d, (int, float)) else 0
				if d <= cutoff and d > ref_at:
					ref_at = d
					v = p.get("totalLiquidityUSD")
					ref = float(v) if isinstance(v, (int, float)) else 0.0
			out["tvl_30d_ago"] = int(ref)
			out["tvl_30d_at"] = ref_at
			return out

		def validator_fn(leader_result) -> bool:
			return isinstance(leader_result, gl.vm.Return)

		self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

	@gl.public.view
	def get_len(self) -> int:
		return int(self.text_len)

	@gl.public.view
	def get_window(self) -> str:
		return str(self.text)

	@gl.public.view
	def get_slice(self, start: int, count: int) -> str:
		s = str(self.text)
		a = int(start)
		n = int(count)
		if a < 0:
			a = 0
		if n <= 0 or n > 6000:
			n = 6000
		return s[a:a + n]

	@gl.public.view
	def get_statuses(self) -> str:
		return str(self.statuses)

	@gl.public.view
	def get_statuses_slice(self, start: int, count: int) -> str:
		s = str(self.statuses)
		a = int(start)
		n = int(count)
		if a < 0:
			a = 0
		if n <= 0 or n > 6000:
			n = 6000
		return s[a:a + n]
