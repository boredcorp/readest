import type { Metadata } from 'next';

import { getSelectedReaderRouteMetadata } from '@/integrations/learningbored/presentation/metadata';

export const metadata: Metadata = getSelectedReaderRouteMetadata('library');

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
