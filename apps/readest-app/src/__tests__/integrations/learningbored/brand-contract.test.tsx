import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import LearningBoredBrandMark from '@/integrations/learningbored/presentation/LearningBoredBrandMark';

const sourceRoot = resolve(import.meta.dirname, '../../..');

describe('LearningBored brand contract', () => {
  it('renders the synchronized canonical mark as decorative lockup media', () => {
    const { container } = render(<LearningBoredBrandMark className='brand-mark' />);
    const mark = container.querySelector('img');

    expect(mark?.getAttribute('alt')).toBe('');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.getAttribute('src')).toContain('/learningbored/mark.svg');
    expect(mark?.className).toContain('brand-mark');
  });

  it('uses the canonical mark component instead of a competing inline fold identity', () => {
    const presentationRoot = resolve(sourceRoot, 'integrations/learningbored/presentation');
    const previewRoot = resolve(sourceRoot, 'integrations/learningbored/preview');
    const workSurfaceRoot = resolve(sourceRoot, 'integrations/learningbored/work-surface');
    const consumers = [
      resolve(workSurfaceRoot, 'LearningBoredWorkSurfaceShell.tsx'),
      resolve(presentationRoot, 'LearningBoredAuthPresentation.tsx'),
      resolve(presentationRoot, 'LearningBoredLibraryPresentation.tsx'),
      resolve(previewRoot, 'LearningBoredPreview.tsx'),
    ].map((path) => readFileSync(path, 'utf8'));

    for (const source of consumers) {
      expect(source).toContain('LearningBoredBrandMark');
      expect(source).not.toContain('LearningBoredFoldMark');
    }

    const workSurfaceStyles = readFileSync(
      resolve(workSurfaceRoot, 'LearningBoredWorkSurface.module.css'),
      'utf8',
    );
    expect(workSurfaceStyles).toContain("[data-lb-theme='eink'] .brandMark");
    expect(workSurfaceStyles).toContain('grayscale(1)');
  });
});
