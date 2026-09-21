'use client';

/**
 * Seed-completion signal.
 *
 * IndexedDB is seeded by an island mounted in the root layout, which races the
 * first page query: a page can mount, read an empty table, and only then have the
 * seed commit. Rather than have every page poll, the seed announces completion
 * through a window event and this module turns that into a React value.
 *
 * `useSeedSignal()` returns `0` until the seed has committed and a monotonically
 * increasing counter afterwards, so pages can list it as an effect dependency to
 * re-run their queries exactly once.
 *
 * The completion flag is sticky for the lifetime of the tab: a route that mounts
 * after the seed committed would otherwise subscribe to an event that has already
 * fired and stay on an empty table until the next cold start.
 */

import { useEffect, useState } from 'react';

export const SEED_COMPLETE_EVENT = 'cineslate:seed-complete';

/** Sticky per-tab flag: flipped once the seed bootstrap reports a commit. */
let hasSeedCompleted = false;

/** Narrows the signal every consumer expects for "the seed has committed". */
const SEEDED_SIGNAL = 1;

/** Called by the seed bootstrap after a successful commit. */
export function announceSeedComplete(): void {
  hasSeedCompleted = true;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SEED_COMPLETE_EVENT));
}

export function useSeedSignal(): number {
  // Adopting the flag at first render means a late-mounting route never renders
  // the empty state at all, instead of rendering it and refetching a tick later.
  const [signal, setSignal] = useState(() => (hasSeedCompleted ? SEEDED_SIGNAL : 0));

  useEffect(() => {
    // Covers the window between render and this effect, where the seed can
    // commit before the listener exists.
    if (hasSeedCompleted) {
      setSignal((current) => (current === 0 ? SEEDED_SIGNAL : current));
    }

    // Later re-seeds (a local data reset) still bump the counter.
    const bump = () => setSignal((current) => current + 1);
    window.addEventListener(SEED_COMPLETE_EVENT, bump);
    return () => window.removeEventListener(SEED_COMPLETE_EVENT, bump);
  }, []);

  return signal;
}

export default useSeedSignal;
