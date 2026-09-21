'use client';

/**
 * Application header: brand, primary navigation, search trigger and viewer menu.
 *
 * The `Cmd`/`Ctrl`+`K` binding is registered here because the header is mounted
 * on every route. Below `md` the navigation collapses into the dedicated
 * `MobileBottomNav`, and the search field becomes an icon-only trigger.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bookmark, CalendarDays, LogOut, Search, Sliders, User as UserIcon } from 'lucide-react';
import { SearchBarOverlay } from '@/components/compound/SearchBarOverlay';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useViewer } from '@/lib/hooks/useViewer';

export interface HeaderNavbarProps {
  /** Disables the global search binding (used by embedded previews). */
  enableSearch?: boolean;
}

const NAV_LINKS = [
  { href: '/films', label: 'Films' },
  { href: '/lists', label: 'Lists' },
  { href: '/diary', label: 'Diary' },
] as const;

export function HeaderNavbar({ enableSearch = true }: HeaderNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isReady } = useViewer();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    if (!enableSearch) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isPaletteCombo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isPaletteCombo) return;
      event.preventDefault();
      setIsSearchOpen((open) => !open);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableSearch]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const profileHref = user ? `/profile/${user.username}` : '/films';

  const menuItems = useMemo<DropdownMenuItem[]>(
    () => [
      {
        id: 'profile',
        label: user ? `Profile (@${user.username})` : 'Profile',
        icon: <UserIcon size={14} aria-hidden="true" />,
        onSelect: () => router.push(profileHref),
      },
      {
        id: 'diary',
        label: 'Your diary',
        icon: <CalendarDays size={14} aria-hidden="true" />,
        onSelect: () => router.push('/diary'),
      },
      {
        id: 'lists',
        label: 'Your lists',
        icon: <Bookmark size={14} aria-hidden="true" />,
        onSelect: () => router.push('/lists'),
      },
      {
        id: 'catalogue',
        label: 'Browse films',
        separated: true,
        icon: <Sliders size={14} aria-hidden="true" />,
        onSelect: () => router.push('/films'),
      },
      {
        id: 'storage',
        label: 'Storage & local data',
        icon: <LogOut size={14} aria-hidden="true" />,
        onSelect: () => router.push(`${profileHref}#local-data`),
      },
    ],
    [profileHref, router, user],
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-bg/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-3 sm:px-4">
          {/* Brand: three-dot Letterboxd-inspired mark. */}
          <Link
            href="/"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
            aria-label="CineSlate home"
          >
            <span aria-hidden="true" className="flex items-center gap-[3px]">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" />
              <span className="h-2.5 w-2.5 rounded-full bg-brand-green" />
              <span className="h-2.5 w-2.5 rounded-full bg-brand-cyan" />
            </span>
            <span className="font-serif text-[15px] font-bold tracking-tight text-text-primary">
              CineSlate
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded px-2.5 text-[11px] font-semibold uppercase tracking-[0.09em] transition-colors ${
                  isActive(link.href)
                    ? 'text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              disabled={!enableSearch}
              aria-label="Search films and members"
              aria-keyshortcuts="Meta+K Control+K"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-border-subtle bg-surface-input px-2.5 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 md:min-w-[190px] md:justify-start"
            >
              <Search size={15} aria-hidden="true" />
              <span className="hidden md:inline">Search films…</span>
              <kbd className="ml-auto hidden rounded border border-border-subtle px-1 font-mono text-[10px] text-text-dim md:inline">
                ⌘K
              </kbd>
            </button>

            {isReady && user ? (
              <DropdownMenu
                items={menuItems}
                label="Account menu"
                renderTrigger={(triggerProps) => (
                  <button
                    ref={triggerProps.ref}
                    type="button"
                    onClick={triggerProps.onClick}
                    aria-haspopup="menu"
                    aria-expanded={triggerProps['aria-expanded']}
                    aria-label={`Account menu for ${user.displayName}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={user.avatarUrl}
                      alt=""
                      width={30}
                      height={30}
                      className="h-[30px] w-[30px] rounded-full border border-border-strong object-cover"
                    />
                  </button>
                )}
              />
            ) : (
              <span
                aria-hidden="true"
                className="h-[30px] w-[30px] animate-pulse rounded-full border border-border-subtle bg-surface-panel"
              />
            )}
          </div>
        </div>
      </header>

      {enableSearch ? (
        <SearchBarOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      ) : null}
    </>
  );
}

export default HeaderNavbar;
