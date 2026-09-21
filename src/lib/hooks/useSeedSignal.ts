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
 */

import { useEffect, useState } from 'react';

export const SEED_COMPLETE_EVENT = 'cineslate:seed-complete';

/** Called by the seed bootstrap after a successful commit. */
export function announceSeedComplete(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SEED_COMPLETE_EVENT));
}

export function useSeedSignal(): number {
  const [signal, setSignal] = useState(0);

  useEffect(() => {
    const bump = () => setSignal((current) => current + 1);
    window.addEventListener(SEED_COMPLETE_EVENT, bump);
    return () => window.removeEventListener(SEED_COMPLETE_EVENT, bump);
  }, []);

  return signal;
}

export default useSeedSignal;
