import type { Metadata } from 'next';
import { FilmsBrowsePage } from '@/components/features/FilmsBrowsePage';

export const metadata: Metadata = {
  title: 'Browse films · CineSlate',
  description:
    'Filter the local catalogue by genre, decade and community rating, then sort by popularity or score.',
};

export default function Page() {
  return <FilmsBrowsePage />;
}
