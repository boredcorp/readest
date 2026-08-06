import type { Metadata } from 'next';

import { getSelectedReaderRouteMetadata } from '@/integrations/learningbored/presentation/metadata';

export const metadata: Metadata = getSelectedReaderRouteMetadata('auth');

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
