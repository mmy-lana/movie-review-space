'use client';

/**
 * Accessible menu container for contextual actions (sort, filter, overflow).
 *
 * Implements the WAI-ARIA menu-button pattern: `aria-haspopup`/`aria-expanded`
 * on the trigger, `role="menu"` with roving `role="menuitem"` children,
 * `ArrowUp`/`ArrowDown`/`Home`/`End` navigation, `Escape` to dismiss, and
 * dismissal on outside pointer-down. A default trigger is provided, but any
 * element can be used via `renderTrigger`.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, MoreHorizontal } from 'lucide-react';

export interface DropdownMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  /** Renders a check mark for the currently applied option. */
  isSelected?: boolean;
  disabled?: boolean;
  /** Renders a divider above this item. */
  separated?: boolean;
  tone?: 'default' | 'danger';
}

export interface DropdownMenuProps {
  items: DropdownMenuItem[];
  /** Accessible name for the menu button. */
  label: string;
  /** Custom trigger renderer; receives the click handler and open state. */
  renderTrigger?: (props: {
    onClick: (event: React.MouseEvent<HTMLElement>) => void;
    isOpen: boolean;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    ref: React.Ref<HTMLButtonElement>;
  }) => ReactNode;
  /** Horizontal alignment of the popover relative to the trigger. */
  align?: 'start' | 'end';
  className?: string;
}

export function DropdownMenu({
  items,
  label,
  renderTrigger,
  align = 'end',
  className = '',
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const menuId = `dropdown-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  const close = useCallback((focusTrigger = true) => {
    setIsOpen(false);
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Outside pointer-down dismissal.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (containerRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen]);

  // Focus the first enabled item when the menu opens.
  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      );
      first?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const focusItemAt = useCallback((index: number) => {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (nodes.length === 0) return;
    const clamped = ((index % nodes.length) + nodes.length) % nodes.length;
    nodes[clamped]?.focus({ preventScroll: true });
  }, []);

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const nodes = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
      );
      const currentIndex = nodes.findIndex((node) => node === document.activeElement);

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          focusItemAt(currentIndex + 1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          focusItemAt(currentIndex - 1);
          return;
        case 'Home':
          event.preventDefault();
          focusItemAt(0);
          return;
        case 'End':
          event.preventDefault();
          focusItemAt(nodes.length - 1);
          return;
        case 'Tab':
          setIsOpen(false);
          return;
        case 'Escape':
          event.preventDefault();
          close();
          return;
        default:
      }
    },
    [close, focusItemAt],
  );

  const triggerProps = {
    onClick: () => setIsOpen((open) => !open),
    isOpen,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': isOpen,
    ref: triggerRef,
  };

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      {renderTrigger ? (
        renderTrigger(triggerProps)
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={triggerProps.onClick}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={label}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      )}

      {isOpen ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className={`absolute top-[calc(100%+4px)] z-50 min-w-[200px] overflow-hidden rounded border border-border-strong bg-surface-elevated py-1 shadow-popover animate-zoom-in-95 ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.separated ? (
                <div role="separator" className="my-1 h-px bg-border-subtle" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  close();
                }}
                className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.tone === 'danger'
                    ? 'text-brand-orange hover:bg-brand-orange/10'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {item.isSelected ? (
                    <Check size={14} aria-hidden="true" className="text-brand-green" />
                  ) : (
                    item.icon ?? null
                  )}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default DropdownMenu;
