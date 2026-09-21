'use client';

/**
 * Touch/mouse swipe gesture handler for mobile drawers.
 *
 * Vertical-only by default: the gesture only engages once the pointer has moved
 * past `threshold` pixels vertically *and* that movement dominates the
 * horizontal axis, so pulling a sheet down never fights a horizontal scroll.
 */

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export type SwipeDirection = 'up' | 'down';

export interface UseSwipeGestureOptions {
  /** Fired continuously while a qualifying drag is in progress. */
  onSwipeMove?: (deltaY: number, direction: SwipeDirection) => void;
  /** Fired on release once the drag passed `threshold`. */
  onSwipeEnd?: (deltaY: number, direction: SwipeDirection) => void;
  /** Fired on release when the drag did not qualify as a swipe. */
  onSwipeCancel?: (deltaY: number) => void;
  /** Minimum vertical travel before the gesture counts as a swipe. */
  threshold?: number;
  /** Disables the gesture entirely when false. */
  enabled?: boolean;
}

export interface SwipeGestureHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface GestureState {
  pointerId: number;
  startX: number;
  startY: number;
  deltaY: number;
  engaged: boolean;
}

/**
 * Returns pointer handlers that translate a vertical drag into swipe events.
 * Attach them to a drag handle or to the whole sheet surface.
 */
export function useSwipeGesture({
  onSwipeMove,
  onSwipeEnd,
  onSwipeCancel,
  threshold = 8,
  enabled = true,
}: UseSwipeGestureOptions = {}): SwipeGestureHandlers {
  const stateRef = useRef<GestureState | null>(null);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      stateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        deltaY: 0,
        engaged: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = stateRef.current;
      if (!enabled || !state || state.pointerId !== event.pointerId) return;

      const deltaY = event.clientY - state.startY;
      const deltaX = event.clientX - state.startX;

      if (!state.engaged) {
        const verticalDominant = Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
        if (Math.abs(deltaY) < threshold || !verticalDominant) return;
        state.engaged = true;
      }

      state.deltaY = deltaY;
      onSwipeMove?.(deltaY, deltaY < 0 ? 'up' : 'down');
    },
    [enabled, onSwipeMove, threshold],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      stateRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (cancelled || !state.engaged) {
        onSwipeCancel?.(state.deltaY);
        return;
      }

      onSwipeEnd?.(state.deltaY, state.deltaY < 0 ? 'up' : 'down');
    },
    [onSwipeCancel, onSwipeEnd],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
    [finish],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
    [finish],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
