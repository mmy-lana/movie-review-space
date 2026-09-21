'use client';

/**
 * Application shell.
 *
 * Wraps every route with the persistent chrome — header, footer, mobile tab bar —
 * and the providers those depend on. The quick-log provider is mounted here (not
 * per page) so a log started from a film card survives navigation, and the shell
 * reserves space at the bottom of the viewport for the mobile tab bar so page
 * content is never hidden behind it.
 */

import { HeaderNavbar } from '@/components/layout/HeaderNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Footer } from '@/components/layout/Footer';
import { QuickLogProvider } from '@/features/quick-log/QuickLogProvider';

export interface ClientShellProps {
  children: React.ReactNode;
}

export function ClientShell({ children }: ClientShellProps) {
  return (
    <QuickLogProvider>
      <div className="relative flex min-h-screen flex-col">
        <HeaderNavbar />

        <div className="flex-1 pb-[76px] md:pb-0">{children}</div>

        <Footer />
        <MobileBottomNav />
      </div>
    </QuickLogProvider>
  );
}

export default ClientShell;
