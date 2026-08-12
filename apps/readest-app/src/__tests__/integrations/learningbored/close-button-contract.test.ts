import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const integrationRoot = resolve(process.cwd(), 'src/integrations/learningbored');
const consumers = [
  resolve(integrationRoot, 'work-surface/LearningBoredWorkSurfaceShell.tsx'),
  resolve(integrationRoot, 'work-surface/LearningBoredReviewSurfaceShell.tsx'),
  resolve(integrationRoot, 'progress/LearningBoredProgressShell.tsx'),
  resolve(integrationRoot, 'LearningBoredExamOverlay.tsx'),
];

describe('LearningBored close-control extraction', () => {
  it('keeps all four proven close controls on the Reader-local primitive', async () => {
    const sources = await Promise.all(consumers.map((path) => readFile(path, 'utf8')));

    for (const source of sources) {
      expect(source).toContain('LearningBoredCloseButton');
      expect(source).not.toMatch(/\bX\b.*from 'lucide-react'/u);
    }
  });
});
