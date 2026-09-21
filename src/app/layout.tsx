import type { Metadata, Viewport } from 'next';
import { SeedBootstrap } from '@/components/system/SeedBootstrap';
import { ClientShell } from '@/components/layout/ClientShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'CineSlate - Movie Review & Rating Social Space',
  description: 'Letterboxd-inspired social film logging, rating, and review community.',
};

export const viewport: Viewport = {
  themeColor: '#14181c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-bg text-text-secondary antialiased selection:bg-brand-green selection:text-surface-bg">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded focus:bg-brand-green focus:px-4 focus:text-[12px] focus:font-bold focus:uppercase focus:tracking-wider focus:text-surface-bg"
        >
          Skip to content
        </a>

        <SeedBootstrap />

        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
