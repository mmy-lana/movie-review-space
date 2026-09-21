'use client';

/**
 * Quick-log provider.
 *
 * Mounts the single quick-log surface for the whole app and publishes the
 * controller through `QuickLogContext`, so the mobile nav, film cards and
 * detail pages all open the same form.
 *
 * It also owns the diary store instance used by that form, and exposes a
 * lightweight subscription (`lastSavedAt` + `subscribeToSaves`) so pages can
 * refresh their own queries after a save without a global state library.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Film } from '@/types/cine';
import { QuickLogContext, type QuickLogContextValue } from '@/lib/hooks/useQuickLog';
import { useDiaryStore } from '@/lib/hooks/useDiaryStore';
import { useViewer } from '@/lib/hooks/useViewer';
import { QuickLogModal } from '@/components/compound/QuickLogModal';

export interface QuickLogProviderProps {
  children: React.ReactNode;
}

export function QuickLogProvider({ children }: QuickLogProviderProps) {
  const { user, userId, isReady } = useViewer();

  const [isOpen, setIsOpen] = useState(false);
  const [film, setFilm] = useState<Film | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(0);

  const listenersRef = useRef(new Set<() => void>());

  const diary = useDiaryStore({ userId, viewer: user, enabled: isReady });

  const open = useCallback<QuickLogContextValue['open']>((options) => {
    setFilm(options?.film ?? null);
    setEntryId(options?.entryId ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    if (isBusy) return;
    setIsOpen(false);
    setFilm(null);
    setEntryId(null);
  }, [isBusy]);

  const notifySaved = useCallback(() => {
    setLastSavedAt(Date.now());
    for (const listener of listenersRef.current) listener();
  }, []);

  const subscribeToSaves = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Reset transient form state when the surface closes without saving.
  useEffect(() => {
    if (isOpen) return;
    setFilm(null);
    setEntryId(null);
  }, [isOpen]);

  const value = useMemo<QuickLogContextValue>(
    () => ({
      isOpen,
      film,
      entryId,
      open,
      close,
      isBusy,
      setBusy: setIsBusy,
      notifySaved,
      lastSavedAt,
      subscribeToSaves,
    }),
    [
      close,
      entryId,
      film,
      isBusy,
      isOpen,
      lastSavedAt,
      notifySaved,
      open,
      subscribeToSaves,
    ],
  );

  return (
    <QuickLogContext.Provider value={value}>
      {children}
      <QuickLogModal
        isOpen={isOpen}
        onClose={close}
        film={film}
        entryId={entryId}
        diary={diary}
        viewerId={userId}
        onSaved={notifySaved}
        onBusyChange={setIsBusy}
      />
    </QuickLogContext.Provider>
  );
}

export default QuickLogProvider;
