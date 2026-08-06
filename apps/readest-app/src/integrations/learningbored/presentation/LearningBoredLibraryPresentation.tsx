'use client';

import type { PropsWithChildren } from 'react';

export default function LearningBoredLibraryPresentation({ children }: PropsWithChildren) {
  return (
    <div className='lb-presentation' data-lb-presentation='library'>
      {children}
    </div>
  );
}
