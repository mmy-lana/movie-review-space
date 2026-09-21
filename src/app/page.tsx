import Link from 'next/link';
import { SeedBootstrap } from '@/components/system/SeedBootstrap';
import { SEED_FILMS } from '@/lib/db/seed';
import { formatCommunityRating } from '@/lib/utils/rating-math';
import { formatCount } from '@/lib/utils/date-format';

/**
 * Placeholder shell for Phase 1.
 *
 * The full homepage — hero spotlight, friends carousel and activity stream — is
 * assembled in Phase 5 on top of the primitives and hooks delivered by Phases
 * 2–4. This route exists so the storage layer has a live surface to bootstrap.
 */
export default function HomePage() {
  const featured = SEED_FILMS.slice(0, 8);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <SeedBootstrap />

      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand-green">
        CineSlate · Local-first film journal
      </p>
      <h1 className="mt-3 font-serif text-3xl font-bold text-text-primary sm:text-4xl">
        Track film. Rate frames. Share taste.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
        The storage engine, domain model and utilities are live. Interface phases build on
        this foundation.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {featured.map((film) => (
          <li key={film.id}>
            <Link
              href={`/films/${film.slug}`}
              className="poster-frame block overflow-hidden bg-surface-panel"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={film.posterUrl}
                alt={`${film.title} poster`}
                width={500}
                height={750}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </Link>
            <p className="mt-2 truncate text-xs font-semibold text-text-primary">
              {film.title}
            </p>
            <p className="font-mono text-[11px] text-text-muted">
              {film.releaseYear} · ★ {formatCommunityRating(film.metrics.communityRating)} ·{' '}
              {formatCount(film.metrics.logCount)} logs
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
