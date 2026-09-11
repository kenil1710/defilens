import { NextResponse } from "next/server";
import { previewSlug } from "@/lib/oracle";

export const dynamic = "force-dynamic";

/** What the contract would make of a typed string, without spending a
 *  transaction to find out. The picker calls this before it offers the button. */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!slug.trim()) {
    return NextResponse.json({ ok: false, reason: "name a protocol first" });
  }
  const out = await previewSlug(slug);
  if (!out) {
    return NextResponse.json(
      { ok: false, reason: "the oracle did not answer just now" },
      { status: 502 },
    );
  }
  return NextResponse.json(out);
}
