import type { Metadata } from 'next';
import { ListDetailPage } from '@/components/features/ListDetailPage';

export const metadata: Metadata = {
  title: 'List · CineSlate',
  description: 'Re-rank a list by dragging, add notes to each entry and control its visibility.',
};

export default function Page() {
  return <ListDetailPage />;
}
