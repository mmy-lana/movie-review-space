import type { Metadata } from 'next';
import { HomePage } from '@/components/features/HomePage';

export const metadata: Metadata = {
  title: 'CineSlate · Track film. Rate frames. Share taste.',
  description:
    'A local-first film journal: log what you watch, rate in half stars, write reviews and build ranked lists.',
};

export default function Page() {
  return <HomePage />;
}
