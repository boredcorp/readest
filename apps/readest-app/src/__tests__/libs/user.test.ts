import { describe, expect, it } from 'vitest';
import { getAccountDeletionUrl } from '@/libs/user';

describe('account deletion routing', () => {
  it('routes legacy Reader deletion to the canonical StoryBored account origin', () => {
    expect(getAccountDeletionUrl('https://storybored.example/old/path?unsafe=1')).toBe(
      'https://storybored.example/account',
    );
  });

  it('rejects non-HTTP origins and embedded credentials', () => {
    expect(() => getAccountDeletionUrl('javascript:alert(1)')).toThrow(/HTTP\(S\) origin/);
    expect(() => getAccountDeletionUrl('https://reader:secret@storybored.example')).toThrow(
      /without credentials/,
    );
  });
});
