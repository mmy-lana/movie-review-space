import type { Metadata } from 'next';
import { FilmReviewsPage } from '@/components/features/FilmReviewsPage';

export const metadata: Metadata = {
  title: 'Reviews · CineSlate',
  description: 'Every written review for this film, sortable and filterable by rating.',
};

export default function Page() {
  return <FilmReviewsPage />;
}
