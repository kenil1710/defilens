/**
 * Frontend audit. Drives a real browser against a real build.
 *
 *   node tools/audit_site.mjs [baseUrl]
 *
 * Everything here is a claim the brief makes about the SITE rather than about
 * the contract, and every one of them is something a reviewer will check by
 * opening the page: that each route answers, that the landing page does not
 * open with a wallet prompt, that nothing scrolls sideways on a phone, that the
 * console is clean, and that every outbound link resolves.
 *
 * Playwright is used if it is installed; without it the DOM checks are skipped
 * loudly rather than silently passing.
 */
const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

let pass = 0, fail = 0, skip = 0;
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", X = "\x1b[0m";
const ok = (m) => { pass++; console.log(`  ${G}✔${X} ${m}`); };
const bad = (m, d) => { fail++; console.log(`  ${R}✘${X} ${m}`); if (d) console.log(`      ${d}`); };
const warn = (m) => { skip++; console.log(`  ${Y}!${X} ${m}`); };
const head = (m) => console.log(`\n${B}${m}${X}`);

const ROUTES = ["/", "/protocols", "/analyze", "/compare", "/docs"];

console.log(`\n${B}DeFiLens site audit${X}  →  ${BASE}`);

/* ───────────────────────────────────────────── 1. every route answers */
head("1. Routes");
let sampleSlug = null;
for (const r of ROUTES) {
  try {
    const res = await fetch(BASE + r, { redirect: "manual" });
    res.status === 200 ? ok(`200 ${r}`) : bad(`${res.status} ${r}`);
  } catch (e) { bad(`${r} did not answer`, e.message); }
}
try {
  const res = await fetch(`${BASE}/api/protocols?limit=1`);
  const body = await res.json();
  if (body.ok && Array.isArray(body.protocols)) ok(`/api/protocols returns live data (${body.total} protocols upstream)`);
  else bad("/api/protocols did not return live data");
} catch (e) { bad("/api/protocols failed", e.message); }

/* a real protocol page, taken from the contract's own list */
try {
  const res = await fetch(`${BASE}/api/preview?slug=aave-v3`);
  const body = await res.json();
  if (body?.ok) { sampleSlug = "aave-v3"; ok("/api/preview answers from the oracle"); }
  else bad("/api/preview did not answer");
} catch (e) { bad("/api/preview failed", e.message); }

if (sampleSlug) {
  const res = await fetch(`${BASE}/protocol/${sampleSlug}`);
  res.status === 200 ? ok(`200 /protocol/${sampleSlug}`) : bad(`${res.status} /protocol/${sampleSlug}`);
  ROUTES.push(`/protocol/${sampleSlug}`);
}

/* ─────────────────────────────────── 2. a 404 is a 404, not a 500 */
head("2. Unknown protocol");
try {
  const res = await fetch(`${BASE}/protocol/definitely-not-a-real-protocol-xyz`);
  res.status === 404 ? ok("an unrated slug renders the not-found page (404)")
                     : bad(`an unrated slug answered ${res.status}, expected 404`);
} catch (e) { bad("unknown slug threw", e.message); }

/* ─── 2b. the SERVER-RENDERED header, before any JavaScript runs ───────────
 *
 * Playwright reads the DOM after hydration, so a header that is wrong in the
 * prerendered HTML and corrects itself on hydration passes every browser check
 * while still shipping a wallet prompt and a chain id on the landing page — to
 * view-source, to the first paint, and to anything that does not run JS. This
 * checks the bytes the server actually sends.
 */
head("2b. Server-rendered header (pre-hydration)");
async function ssrHeader(path) {
  const res = await fetch(BASE + path);
  const html = await res.text();
  const m = html.match(/<header\b[\s\S]*?<\/header>/);
  return m ? m[0] : "";
}
{
  const landing = await ssrHeader("/");
  if (!landing) bad("no <header> in the landing page's HTML");
  else {
    /61997|Studio Dev/.test(landing)
      ? bad("the landing page's PRERENDERED header carries a chain badge")
      : ok("landing page HTML carries no chain badge before hydration");
    /Connect|Get a wallet/.test(landing)
      ? bad("the landing page's PRERENDERED header carries a wallet control")
      : ok("landing page HTML carries no wallet control before hydration");
  }
  for (const r of ["/protocols", "/analyze", "/docs", "/compare"]) {
    const h = await ssrHeader(r);
    const hasNet = /Studio Dev/.test(h);
    const hasWallet = /Connect|Get a wallet|0x/.test(h);
    hasNet && hasWallet
      ? ok(`${r} HTML carries both before hydration`)
      : bad(`${r} PRERENDERED header is missing ${!hasWallet ? "the wallet control" : "the network badge"}`);
  }
}

/* ──────────────────────────────── 3. DOM checks, which need a browser */
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { /* not installed */ }

if (!chromium) {
  head("3-5. Browser checks");
  warn("playwright not installed — wallet, overflow and console checks skipped");
  warn("install with: npx playwright install chromium");
} else {
  const browser = await chromium.launch();

  head("3. The landing page asks for nothing");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 90_000 });
    const header = await page.locator("header").innerText();
    /Connect|Get a wallet/i.test(header)
      ? bad("the landing header offers a wallet connect")
      : ok("no wallet connect in the landing header");
    /Studio Dev|#61997|chain/i.test(header)
      ? bad("the landing header shows a network badge")
      : ok("no network badge in the landing header");
    const h1 = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ");
    /Know before you deposit/i.test(h1)
      ? ok(`hero headline: "${h1}"`)
      : bad(`unexpected hero headline: "${h1}"`);
    for (const section of ["Why DeFiLens", "How it works"]) {
      (await page.getByText(section, { exact: false }).count()) > 0
        ? ok(`"${section}" section present`)
        : bad(`"${section}" section missing`);
    }
    await page.close();
  }

  head("4. App pages carry the wallet and the network");
  for (const r of ["/analyze", "/protocols", "/docs"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE + r, { waitUntil: "load", timeout: 90_000 });
    const header = await page.locator("header").innerText();
    const hasWallet = /Connect|Get a wallet|0x/i.test(header);
    const hasNet = /Studio Dev/i.test(header);
    hasWallet && hasNet
      ? ok(`${r} shows both the wallet control and the network badge`)
      : bad(`${r} is missing ${!hasWallet ? "the wallet control" : "the network badge"}`);
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.goto(BASE + "/analyze", { waitUntil: "load", timeout: 90_000 });
    (await page.getByText("First time here?", { exact: false }).count()) > 0
      ? ok("/analyze carries the onboarding guide")
      : bad("/analyze is missing the onboarding guide");
    await page.close();
    const d = await browser.newPage();
    await d.goto(BASE + "/docs", { waitUntil: "load", timeout: 90_000 });
    (await d.getByText("First time here?", { exact: false }).count()) > 0
      ? ok("/docs carries the same onboarding guide")
      : bad("/docs is missing the onboarding guide");
    await d.close();
  }

  head("5. No horizontal scroll at 390px, and a clean console");
  for (const r of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e.message)));
    try {
      await page.goto(BASE + r, { waitUntil: "load", timeout: 90_000 });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const wide = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.right > de.clientWidth + 1) {
            wide.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""} → ${Math.round(rect.right)}px`);
          }
          if (wide.length > 3) break;
        }
        return { scrollW: de.scrollWidth, clientW: de.clientWidth, wide };
      });
      overflow.scrollW <= overflow.clientW + 1
        ? ok(`390px: no horizontal scroll on ${r}`)
        : bad(`390px: ${r} scrolls to ${overflow.scrollW}px (viewport ${overflow.clientW})`,
              overflow.wide.join(" | "));
      // A wallet-less browser legitimately logs nothing; anything here is ours.
      const real = errors.filter((e) => !/favicon|ERR_INTERNET_DISCONNECTED/i.test(e));
      real.length === 0
        ? ok(`no console errors on ${r}`)
        : bad(`${real.length} console error(s) on ${r}`, real[0]?.slice(0, 160));
    } catch (e) {
      bad(`${r} failed to render at 390px`, e.message);
    }
    await page.close();
  }

  head("6. Outbound links resolve");
  {
    const page = await browser.newPage();
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 90_000 });
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href^='http']")).map((a) => a.href));
    const unique = Array.from(new Set(hrefs));
    for (const href of unique) {
      try {
        const res = await fetch(href, { method: "GET", redirect: "follow" });
        res.ok ? ok(`${res.status} ${href}`) : bad(`${res.status} ${href}`);
      } catch (e) { bad(`unreachable ${href}`, e.message); }
    }
    if (unique.length === 0) warn("no outbound links found on the landing page");
    await page.close();
  }

  await browser.close();
}

console.log(`\n${B}${pass} passed, ${fail} failed, ${skip} skipped${X}\n`);
process.exit(fail ? 1 : 0);
