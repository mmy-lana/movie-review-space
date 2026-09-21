import type { Metadata } from 'next';
import { ListsPage } from '@/components/features/ListsPage';

export const metadata: Metadata = {
  title: 'Lists · CineSlate',
  description: 'Curated, rankable film collections stored in this browser.',
};

export default function Page() {
  return <ListsPage />;
}
