'use client';

/**
 * Client-only database bootstrap.
 *
 * IndexedDB cannot be touched during server rendering, so seeding is isolated
 * to this island and mounted once from the root layout. It renders nothing
 * except: (1) an offline notice when IndexedDB is unavailable, and (2) an
 * accessible status announcement while the first seed runs.
 */

import { useEffect, useState } from 'react';
import { isDatabaseAvailable } from '@/lib/db/indexdb';
import { initializeDatabaseSeed } from '@/lib/db/seed';

type BootstrapState = 'pending' | 'ready' | 'unavailable' | 'failed';

export interface SeedBootstrapProps {
  /** Milliseconds before the "still loading" affordance is announced. */
  announceDelayMs?: number;
}

export function SeedBootstrap({ announceDelayMs = 600 }: SeedBootstrapProps) {
  const [state, setState] = useState<BootstrapState>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [announce, setAnnounce] = useState(false);

  useEffect(() => {
    if (!isDatabaseAvailable()) {
      setState('unavailable');
      setErrorMessage(
        'IndexedDB is unavailable in this browser context. Private browsing or a locked-down profile blocks local storage, so nothing you log can be saved.',
      );
      return;
    }

    let cancelled = false;

    initializeDatabaseSeed()
      .then(() => {
        if (!cancelled) setState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState('failed');
        setErrorMessage(
          error instanceof Error
            ? `Local database could not be initialised: ${error.message}`
            : 'Local database could not be initialised for an unknown reason.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== 'pending') return;
    const timer = window.setTimeout(() => setAnnounce(true), announceDelayMs);
    return () => window.clearTimeout(timer);
  }, [state, announceDelayMs]);

  if (state === 'ready') return null;

  if (state === 'pending') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 md:bottom-6"
      >
        {announce ? (
          <p className="rounded border border-border-subtle bg-surface-elevated px-3 py-1.5 font-mono text-[11px] text-text-muted shadow-popover">
            Preparing local library…
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[60] border-b border-brand-orange/40 bg-surface-elevated px-4 py-2 text-center"
    >
      <p className="mx-auto max-w-3xl text-[12px] leading-snug text-brand-orange">
        {errorMessage}
      </p>
    </div>
  );
}

export default SeedBootstrap;
