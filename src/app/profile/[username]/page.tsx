import type { Metadata } from 'next';
import { ProfilePage } from '@/components/features/ProfilePage';

export const metadata: Metadata = {
  title: 'Profile · CineSlate',
  description:
    'Watch history, rating distribution, favourite four, reviews and lists for this member.',
};

export default function Page() {
  return <ProfilePage />;
}
