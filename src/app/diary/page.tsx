import type { Metadata } from 'next';
import { DiaryPage } from '@/components/features/DiaryPage';

export const metadata: Metadata = {
  title: 'Diary · CineSlate',
  description:
    'Your watch history grouped by month, with ratings, rewatches and links to the reviews you wrote.',
};

export default function Page() {
  return <DiaryPage />;
}
