import type { Metadata, Viewport } from 'next';
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
        <div className="relative flex min-h-screen flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
