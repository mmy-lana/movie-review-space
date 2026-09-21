'use client';

/**
 * Mobile bottom tab bar (visible below `md`).
 *
 * Four destinations plus a raised centre action that opens the quick-log form
 * for the last film the viewer interacted with, or a free-form new entry when
 * nothing is selected. Every target is 44×44px or larger and the bar reserves
 * `env(safe-area-inset-bottom)` so it clears the iOS home indicator.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bookmark, CalendarDays, Home, Plus, User as UserIcon } from 'lucide-react';
import { useOptionalQuickLog } from '@/lib/hooks/useQuickLog';
import { useViewer } from '@/lib/hooks/useViewer';

export interface MobileBottomNavProps {
  /** Hides the centre action when the quick-log provider is not mounted. */
  enableQuickLog?: boolean;
}

export function MobileBottomNav({ enableQuickLog = true }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { user } = useViewer();
  const quickLog = useOptionalQuickLog();

  const profileHref = user ? `/profile/${user.username}` : '/films';

  const tabs = [
    { href: '/', label: 'Home', Icon: Home },
    { href: '/films', label: 'Films', Icon: Bookmark },
    { href: '/diary', label: 'Diary', Icon: CalendarDays },
    { href: profileHref, label: 'Profile', Icon: UserIcon },
  ] as const;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const canQuickLog = enableQuickLog && quickLog !== null;

  return (
    <nav
      aria-label="Primary mobile"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-bg/95 backdrop-blur-md md:hidden ${
        canQuickLog ? 'pb-[max(0.25rem,env(safe-area-inset-bottom))]' : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
      }`}
    >
      <ul
        className={`mx-auto grid max-w-md items-center px-1 ${
          canQuickLog ? 'grid-cols-5' : 'grid-cols-4'
        }`}
      >
        {tabs.slice(0, 2).map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                isActive(href) ? 'text-brand-green' : 'text-text-muted'
              }`}
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}

        {canQuickLog ? (
          <li className="flex justify-center">
            <button
              type="button"
              onClick={() => quickLog.open({ film: null })}
              aria-label="Log a film"
              className="-mt-5 inline-flex h-14 w-14 items-center justify-center rounded-full border-4 border-surface-bg bg-brand-green text-surface-bg shadow-card transition-transform active:scale-95"
            >
              <Plus size={24} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </li>
        ) : null}

        {tabs.slice(2).map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                isActive(href) ? 'text-brand-green' : 'text-text-muted'
              }`}
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default MobileBottomNav;
