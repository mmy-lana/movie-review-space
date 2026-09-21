import { getDb } from './lib/db/indexdb';
import { initializeDatabaseSeed } from './lib/db/seed';

export async function bootstrapCineSlateClient(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      getDb();
      await initializeDatabaseSeed();
      console.info('[CineSlate] Client runtime initialized successfully.');
    } catch (err) {
      console.error('[CineSlate] Client initialization error:', err);
    }
  }
}

export * from './types/cine';
export { getDb } from './lib/db/indexdb';
