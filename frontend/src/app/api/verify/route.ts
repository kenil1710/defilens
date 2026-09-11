import { NextResponse } from "next/server";
import { verifyAssessment } from "@/lib/oracle";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 0) {
    return NextResponse.json({ reason: "bad assessment id" }, { status: 400 });
  }
  const out = await verifyAssessment(id);
  if (!out) {
    return NextResponse.json(
      { reason: "The oracle did not answer just now. Try again in a moment." },
      { status: 502 },
    );
  }
  return NextResponse.json(out);
}
