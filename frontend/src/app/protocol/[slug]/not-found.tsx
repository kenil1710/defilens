import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">No rating for that protocol</h1>
      <p className="text-ink-2 mx-auto mt-3 max-w-[48ch] leading-relaxed">
        Nobody has asked the oracle about it yet, so there is nothing stored. That
        is not the same as a low score — it is no score.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/analyze" className="bg-accent hover:bg-accent-dark rounded-lg px-5 py-2.5 text-sm font-semibold text-white">
          Rate it now
        </Link>
        <Link href="/protocols" className="border-rule-2 hover:bg-wash rounded-lg border bg-white px-5 py-2.5 text-sm font-semibold">
          Browse ratings
        </Link>
      </div>
    </div>
  );
}
