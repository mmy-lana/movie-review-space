'use client';

/**
 * Cinematic backdrop banner with a bottom vignette into the app canvas.
 *
 * The image is decorative (`aria-hidden`, empty `alt`): the film title is always
 * rendered as real text by the caller, so screen-reader users never depend on
 * the backdrop. A failed or missing URL degrades to the charcoal gradient plate,
 * keeping hero layout stable offline.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type BackdropHeight = 'sm' | 'md' | 'lg' | 'full';

export interface BackdropHeroProps {
  /** Backdrop image URL; may be empty to force the gradient plate. */
  src: string | null | undefined;
  /** Rendered above the vignette. */
  children?: React.ReactNode;
  height?: BackdropHeight;
  /** Adds a stronger blur to the photographic layer. */
  blur?: boolean;
  /** Overrides the default vignette stops. */
  gradient?: 'vignette' | 'bottom' | 'none';
  /** Constrains inner content width. */
  maxWidth?: 'full' | 'content';
  className?: string;
  priority?: boolean;
  /** Alt text is normally suppressed; pass a value only for meaningful imagery. */
  alt?: string;
}

const HEIGHT_CLASSES: Record<BackdropHeight, string> = {
  sm: 'min-h-[220px] sm:min-h-[260px]',
  md: 'min-h-[300px] sm:min-h-[380px]',
  lg: 'min-h-[380px] sm:min-h-[480px]',
  full: 'min-h-[60dvh] sm:min-h-[70dvh]',
};

const GRADIENT_CLASSES: Record<'vignette' | 'bottom' | 'none', string> = {
  vignette: 'backdrop-vignette',
  bottom:
    'bg-gradient-to-b from-surface-bg/70 via-surface-bg/85 to-surface-bg',
  none: '',
};

export function BackdropHero({
  src,
  children,
  height = 'md',
  blur = false,
  gradient = 'vignette',
  maxWidth = 'content',
  className = '',
  priority = false,
  alt,
}: BackdropHeroProps) {
  const hasSource = typeof src === 'string' && src.trim().length > 0;
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    hasSource ? 'loading' : 'error',
  );
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setStatus(hasSource ? 'loading' : 'error');
  }, [src, hasSource]);

  useEffect(() => {
    const node = imageRef.current;
    if (node?.complete && node.naturalWidth > 0) setStatus('loaded');
  }, [src]);

  const handleLoad = useCallback(() => setStatus('loaded'), []);
  const handleError = useCallback(() => setStatus('error'), []);

  return (
    <section
      className={`relative isolate w-full overflow-hidden border-b border-border-subtle bg-surface-panel ${HEIGHT_CLASSES[height]} ${className}`}
    >
      <div className="absolute inset-0" aria-hidden="true">
        {status === 'loaded' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={hasSource ? src : undefined}
            alt={alt ?? ''}
            aria-hidden={alt ? undefined : 'true'}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            draggable={false}
            onLoad={handleLoad}
            onError={handleError}
            className={`h-full w-full object-cover object-center animate-fade-in ${
              blur ? 'scale-105 blur-sm' : ''
            }`}
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={hasSource ? src : undefined}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              onLoad={handleLoad}
              onError={handleError}
              className="hidden"
            />
            <div className="h-full w-full bg-[radial-gradient(ellipse_at_top,var(--color-surface-elevated)_0%,var(--color-surface-bg)_70%)]" />
          </>
        )}
      </div>

      <div
        aria-hidden="true"
        className={`absolute inset-0 ${GRADIENT_CLASSES[gradient]}`}
      />

      <div
        className={`relative z-10 mx-auto flex h-full w-full flex-col justify-end px-4 py-6 sm:px-6 sm:py-8 ${
          maxWidth === 'content' ? 'max-w-6xl' : ''
        }`}
      >
        {children}
      </div>
    </section>
  );
}

export default BackdropHero;
