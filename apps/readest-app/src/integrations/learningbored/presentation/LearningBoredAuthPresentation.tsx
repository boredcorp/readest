'use client';

import type { PropsWithChildren } from 'react';

export default function LearningBoredAuthPresentation({ children }: PropsWithChildren) {
  return (
    <div className='lb-presentation' data-lb-presentation='auth'>
      {children}
    </div>
  );
}
