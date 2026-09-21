'use client';

/**
 * 2:3 poster renderer with blur-up loading and a graceful failure state.
 *
 * A plain `<img>` is used deliberately: poster URLs are user-supplied and may
 * point at any host, which the Next.js image optimiser cannot serve without a
 * build-time allow-list. Staying on the native element keeps offline and
 * arbitrary-host posters working identically.
 *
 * States rendered: skeleton shimmer (loading) → blur-up image (loaded) →
 * type-written fallback plate (error or missing URL).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type PosterSizeHint = 'grid' | 'detail' | 'row';

export interface PosterImageProps {
  /** Poster URL. An empty value renders the fallback plate immediately. */
  src: string | null | undefined;
  /** Used for `alt` text and the fallback watermark. */
  title: string;
  /** Renders `alt` text (detail views) or treats the poster as decorative. */
  decorative?: boolean;
  sizeHint?: PosterSizeHint;
  /** Overlays pushed on top of the poster (hover actions, ranks, badges). */
  children?: React.ReactNode;
  /** Applied to the 2:3 frame. */
  className?: string;
  /** Applied to the `<img>` element. */
  imageClassName?: string;
  priority?: boolean;
}

const SIZE_HINTS: Record<PosterSizeHint, string> = {
  grid: '(max-width: 429px) 33vw, (max-width: 767px) 25vw, (max-width: 1439px) 16vw, 190px',
  detail: '(max-width: 767px) 45vw, 260px',
  row: '60px',
};

/** Derives a short type watermark from the film title. */
function initials(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return 'CS';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
}

export function PosterImage({
  src,
  title,
  decorative = false,
  sizeHint = 'grid',
  children,
  className = '',
  imageClassName = '',
  priority = false,
}: PosterImageProps) {
  const hasSource = typeof src === 'string' && src.trim().length > 0;
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    hasSource ? 'loading' : 'error',
  );
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setStatus(hasSource ? 'loading' : 'error');
  }, [src, hasSource]);

  // A cached image can complete before React attaches `onLoad`.
  useEffect(() => {
    const node = imageRef.current;
    if (node?.complete && node.naturalWidth > 0) {
      setStatus('loaded');
    }
  }, [src]);

  const handleLoad = useCallback(() => setStatus('loaded'), []);
  const handleError = useCallback(() => setStatus('error'), []);

  const alt = decorative ? '' : `${title} poster`;

  return (
    <div
      className={`poster-frame group/poster ${className}`}
      data-poster-status={status}
    >
      {status === 'error' ? (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-panel px-2 text-center"
          role={decorative ? 'presentation' : 'img'}
          aria-label={decorative ? undefined : `${title} poster unavailable`}
        >
          <span
            aria-hidden="true"
            className="font-serif text-2xl font-bold tracking-[0.2em] text-text-dim"
          >
            {initials(title)}
          </span>
          <span className="line-clamp-2 text-[10px] font-medium leading-tight text-text-muted">
            {title}
          </span>
        </div>
      ) : (
        <>
          {status === 'loading' ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 overflow-hidden bg-surface-panel"
            >
              <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface-skeleton to-transparent" />
            </div>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={hasSource ? src : undefined}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            draggable={false}
            sizes={SIZE_HINTS[sizeHint]}
            onLoad={handleLoad}
            onError={handleError}
            className={`h-full w-full object-cover ${
              status === 'loaded' ? 'animate-blur-up' : 'opacity-0'
            } ${imageClassName}`}
          />
        </>
      )}

      {children}
    </div>
  );
}

export default PosterImage;
