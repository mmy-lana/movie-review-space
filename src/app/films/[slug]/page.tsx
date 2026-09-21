import type { Metadata } from 'next';
import { FilmDetailPage } from '@/components/features/FilmDetailPage';

export const metadata: Metadata = {
  title: 'Film · CineSlate',
  description:
    'Ratings, community distribution, cast and crew, and every review written for this film.',
};

export default function Page() {
  return <FilmDetailPage />;
}
