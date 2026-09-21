'use client';

/**
 * Client-side authentication surface.
 *
 * CINE-SOCIAL-BOXD is a local-first single-viewer application: the signed-in
 * user is the first seeded profile, resolved once on the client because
 * IndexedDB is unavailable during server rendering. This module is the single
 * source of that identity so no page has to hardcode a user id.
 */

import { useEffect, useState } from 'react';
import type { UserProfile } from '@/types/cine';
import { getProfileById } from '@/lib/db/queries';
import { SEED_PRIMARY_USER_ID, getPrimarySeedProfile } from '@/lib/db/seed';
import { isDatabaseAvailable } from '@/lib/db/indexdb';

export interface ViewerState {
  /** The signed-in profile, or `null` while loading / unavailable. */
  user: UserProfile | null;
  userId: string;
  isReady: boolean;
  /** True when the profile came from IndexedDB rather than the seed fixture. */
  isPersisted: boolean;
}

/**
 * Resolves the signed-in viewer.
 *
 * Resolves immediately from the in-memory seed fixture so the shell renders on
 * the first paint, then upgrades to the persisted row once IndexedDB answers.
 */
export function useViewer(): ViewerState {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPersisted, setIsPersisted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!isDatabaseAvailable()) {
      setUser(getPrimarySeedProfile());
      setIsReady(true);
      return;
    }

    getProfileById(SEED_PRIMARY_USER_ID)
      .then((profile) => {
        if (cancelled) return;
        if (profile) {
          setUser(profile);
          setIsPersisted(true);
        } else {
          setUser(getPrimarySeedProfile());
        }
        setIsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setUser(getPrimarySeedProfile());
        setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    user,
    userId: user?.id ?? SEED_PRIMARY_USER_ID,
    isReady,
    isPersisted,
  };
}

export default useViewer;
