"use client";

import { useEffect, useState } from "react";
import { ago } from "@/lib/format";

/**
 * A relative timestamp that does not break hydration.
 *
 * `ago()` reads the clock during render. Inside a client component that means
 * the server computes it at request time and the browser recomputes it at
 * hydration — seconds or minutes later, from a response that may have been
 * cached for the whole revalidation window. React sees two different strings
 * for one node, throws hydration error #418, and throws the subtree away.
 *
 * Two things fix it. `suppressHydrationWarning` tells React this node's text is
 * expected to differ, so the server's string survives hydration intact. Then a
 * single state change after mount forces one more render, which recomputes the
 * string against the browser's own clock — by which point there is nothing left
 * to disagree with.
 */
export function TimeAgo({ epoch, className }: { epoch: number; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // `mounted` is not read in the output: it exists to schedule the one
  // post-hydration render in which `ago()` is evaluated against the real clock.
  void mounted;
  return (
    <span className={className} suppressHydrationWarning>
      {ago(epoch)}
    </span>
  );
}
