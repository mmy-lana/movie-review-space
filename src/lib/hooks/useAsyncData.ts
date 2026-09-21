'use client';

/**
 * Generic client-side read hook for IndexedDB-backed pages.
 *
 * Collapses the loading / error / data triad every page needs into one place and
 * re-runs the loader when the caller says so — normally on a seed or save signal,
 * both of which are plain numbers.
 *
 * The loader must be stable (wrap it in `useCallback`), which is what lets the
 * dependency list stay honest without re-fetching on every render.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncDataState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
  /** Runs the loader again, keeping the previous data visible while it resolves. */
  reload: () => void;
}

/**
 * Reads a value once on mount and whenever `deps` change.
 *
 * A superseded request never writes to state, so a fast filter change cannot be
 * overwritten by a slow earlier response.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  initial: T,
  deps: ReadonlyArray<unknown> = [],
): AsyncDataState<T> {
  const [data, setData] = useState<T>(initial);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);

    try {
      const result = await loaderRef.current();
      if (!isMountedRef.current || requestIdRef.current !== requestId) return;
      setData(result);
      setError(null);
    } catch (cause: unknown) {
      if (!isMountedRef.current || requestIdRef.current !== requestId) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Something went wrong while reading local data.',
      );
    } finally {
      if (isMountedRef.current && requestIdRef.current === requestId) setIsLoading(false);
    }
  }, []);

  // `deps` is a caller-supplied dependency list, so its identity is deliberately
  // not part of the dependency array itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void run();
  }, [run, nonce, ...deps]);

  const reload = useCallback(() => setNonce((current) => current + 1), []);

  return { data, isLoading, error, reload };
}

export default useAsyncData;
