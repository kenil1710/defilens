/** Screenshots, desktop and mobile, of every page a reviewer will open. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
const OUT = new URL("../screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["01-landing", "/"],
  ["02-protocols", "/protocols"],
  ["03-protocol-safe", "/protocol/morpho-blue"],
  ["04-protocol-highrisk", "/protocol/swaphood-v3"],
  ["05-analyze", "/analyze"],
  ["06-compare", "/compare"],
  ["07-docs", "/docs"],
];

const browser = await chromium.launch();
for (const [name, path] of PAGES) {
  for (const [suffix, viewport] of [
    ["", { width: 1440, height: 1000 }],
    ["-mobile", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    // "load", not "networkidle": a protocol page fetches a multi-megabyte TVL
    // series for its chart, and waiting for the network to go quiet means
    // waiting for that — which routinely outlasts a 30s budget on a page that
    // was visually complete in two seconds.
    await page.goto(BASE + path, { waitUntil: "load", timeout: 90_000 });
    // Let the gauge sweep, the meters fill and the chart settle.
    await page.waitForTimeout(3500);
    const file = `${OUT}${name}${suffix}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ${name}${suffix}`);
    await page.close();
  }
}
await browser.close();
console.log("done");
