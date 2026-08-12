import { describe, expect, it } from 'vitest';

import {
  getReaderLearningBoredBoardThemeId,
  LEARNINGBORED_BOARD_THEME_BY_PRESENTATION,
} from '@/integrations/learningbored/presentation/theme';

describe('LearningBored Reader Board theme map', () => {
  it('maps every Reader presentation theme to the exact Miura Board theme ID', () => {
    expect(LEARNINGBORED_BOARD_THEME_BY_PRESENTATION).toEqual({
      light: 'miura-deployment-light-v1',
      dark: 'miura-deployment-dark-v1',
      eink: 'miura-deployment-eink-v1',
    });
    expect(getReaderLearningBoredBoardThemeId('light')).toBe('miura-deployment-light-v1');
    expect(getReaderLearningBoredBoardThemeId('dark')).toBe('miura-deployment-dark-v1');
    expect(getReaderLearningBoredBoardThemeId('eink')).toBe('miura-deployment-eink-v1');
  });
});
