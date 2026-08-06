'use client';

import type { PropsWithChildren } from 'react';

export default function LearningBoredAccountPresentation({ children }: PropsWithChildren) {
  return (
    <div className='lb-presentation' data-lb-presentation='account'>
      {children}
    </div>
  );
}
