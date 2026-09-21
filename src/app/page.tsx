'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Film } from '@/types/cine';
import { initializeDatabaseSeed, SEED_FILMS } from '@/lib/db/seed';

export default function HomePage() {
  const [films, setFilms] = useState<Film[]>(SEED_FILMS);

  useEffect(() => {
    initializeDatabaseSeed()
      .then(() => {
        setFilms(SEED_FILMS);
      })
      .catch((err) => {
        console.error('Failed to initialize seed dataset:', err);
      });
  }, []);

  return (
    <main className="flex-1 pb-20 md:pb-12">
      {/* Top Brand Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border-subtle bg-surface-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-wider text-text-primary">
            <span className="inline-block h-3.5 w-3.5 rounded-full bg-brand-green shadow-[0_0_8px_rgba(0,224,84,0.6)]" />
            <span className="text-base tracking-widest uppercase">CineSlate</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/films" className="text-text-secondary hover:text-text-primary transition-colors">
              Films
            </Link>
            <Link href="/lists" className="text-text-secondary hover:text-text-primary transition-colors">
              Lists
            </Link>
            <Link href="/diary" className="text-text-secondary hover:text-text-primary transition-colors">
              Diary
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Spotlight */}
      <section className="relative overflow-hidden border-b border-border-subtle bg-surface-panel py-12 px-4 md:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-mono tracking-widest text-brand-green uppercase mb-2">
            Social Film Journal & Critique Matrix
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold text-text-primary tracking-tight">
            Track film. Rate frames. Share taste.
          </h1>
          <p className="mt-4 text-sm md:text-base text-text-secondary max-w-2xl mx-auto leading-relaxed">
            A high-contrast cinematic diary built for cinephiles. Log what you watch, formulate nuanced star ratings down to the half-point, and preserve personal list canons.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/films"
              className="rounded bg-brand-green px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-surface-bg transition-transform hover:scale-105 active:scale-95"
            >
              Explore Catalog
            </Link>
            <Link
              href="/diary"
              className="rounded border border-border-strong bg-surface-elevated px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-brand-green"
            >
              Open Watched Diary
            </Link>
          </div>
        </div>
      </section>

      {/* Popular Films Grid Preview */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Popular in the Collective
          </h2>
          <Link href="/films" className="text-xs font-mono text-brand-green hover:underline">
            View All →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
          {films.map((film) => (
            <Link
              key={film.id}
              href={`/films/${film.slug}`}
              className="group flex flex-col overflow-hidden rounded bg-surface-panel border border-border-subtle hover:border-brand-green transition-all"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden bg-surface-elevated">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={film.posterUrl}
                  alt={film.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="p-3">
                <div className="flex items-baseline justify-between gap-1">
                  <h3 className="truncate text-xs font-bold text-text-primary group-hover:text-brand-green transition-colors">
                    {film.title}
                  </h3>
                  <span className="text-[11px] font-mono text-text-muted shrink-0">
                    {film.releaseYear}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-brand-green">
                  <span>★ {film.metrics.communityRating.toFixed(1)}</span>
                  <span className="text-text-muted">{film.metrics.logCount.toLocaleString()} logs</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Mobile Bottom Fixed Nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-14 w-full items-center justify-around border-t border-border-subtle bg-surface-bg/95 backdrop-blur-md md:hidden">
        <Link href="/" className="flex flex-col items-center justify-center p-2 text-text-primary">
          <span className="text-[11px] font-medium tracking-wide">Home</span>
        </Link>
        <Link href="/films" className="flex flex-col items-center justify-center p-2 text-text-secondary">
          <span className="text-[11px] font-medium tracking-wide">Films</span>
        </Link>
        <button
          type="button"
          aria-label="Quick Log Film"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green text-surface-bg shadow-[0_0_12px_rgba(0,224,84,0.4)]"
        >
          <span className="text-xl font-bold leading-none">+</span>
        </button>
        <Link href="/diary" className="flex flex-col items-center justify-center p-2 text-text-secondary">
          <span className="text-[11px] font-medium tracking-wide">Diary</span>
        </Link>
        <Link href="/profile/cinephile" className="flex flex-col items-center justify-center p-2 text-text-secondary">
          <span className="text-[11px] font-medium tracking-wide">Profile</span>
        </Link>
      </nav>
    </main>
  );
}
