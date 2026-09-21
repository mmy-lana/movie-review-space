/**
 * Test bootstrap for the Node verification harness.
 *
 * The application is browser-first: `src/lib/db/indexdb.ts` reads the global
 * `indexedDB`, and `useFilmRatings` / `useDiaryStore` fall back to
 * `crypto.randomUUID()`. Node has neither, so this module installs both before
 * any application module is imported.
 *
 * Import this file (with a side-effecting import) as the very first statement of
 * a verification script — `fake-indexeddb` must be registered before `dexie` is
 * evaluated.
 */

import { webcrypto } from 'node:crypto';
import { indexedDB as fakeIndexedDB, IDBKeyRange as fakeIDBKeyRange } from 'fake-indexeddb';

if (!('crypto' in globalThis) || typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

if (!('indexedDB' in globalThis)) {
  // Installed explicitly rather than via `fake-indexeddb/auto`, which ships no
  // type declarations and would fail the harness typecheck.
  Object.defineProperties(globalThis, {
    indexedDB: { value: fakeIndexedDB, writable: true, configurable: true },
    IDBKeyRange: { value: fakeIDBKeyRange, writable: true, configurable: true },
  });
}

if (!('CustomEvent' in globalThis)) {
  class NodeCustomEvent<T> extends Event {
    readonly detail: T;
    constructor(type: string, init?: { detail?: T }) {
      super(type);
      this.detail = (init?.detail ?? undefined) as T;
    }
  }
  Object.defineProperty(globalThis, 'CustomEvent', {
    value: NodeCustomEvent,
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
    writable: true,
    configurable: true,
  });
}

/**
 * A minimal `window` shim.
 *
 * Application modules guard every browser API behind `typeof window !==
 * 'undefined'`, which is exactly the check server rendering relies on. Providing
 * a window whose globals point at the fake implementations exercises the real
 * client code path rather than bypassing it.
 */
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  const listeners = new Map<string, Set<(event: Event) => void>>();

  const windowShim = {
    indexedDB: (globalThis as { indexedDB: IDBFactory }).indexedDB,
    localStorage: (globalThis as { localStorage: Storage }).localStorage,
    crypto: (globalThis as { crypto: Crypto }).crypto,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    value: windowShim,
    writable: true,
    configurable: true,
  });

  // `useWatchlist` and `useSeedSignal` reach for the same event target through
  // the global scope, so keep the two views consistent.
  if (typeof (globalThis as { addEventListener?: unknown }).addEventListener === 'undefined') {
    Object.defineProperty(globalThis, 'addEventListener', {
      value: windowShim.addEventListener,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'removeEventListener', {
      value: windowShim.removeEventListener,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'dispatchEvent', {
      value: windowShim.dispatchEvent,
      writable: true,
      configurable: true,
    });
  }
}
