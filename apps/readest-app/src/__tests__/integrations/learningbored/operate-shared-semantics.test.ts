import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getBookshelfScrollBehavior } from '@/app/library/components/bookshelfPresentation';

const sourceRoot = resolve(import.meta.dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(sourceRoot, relativePath), 'utf8');
}

describe('shared Operate semantics', () => {
  it('names library and storage controls and keeps phone targets at least 44px', () => {
    const libraryHeader = readSource('app/library/components/LibraryHeader.tsx');
    const bookItem = readSource('app/library/components/BookItem.tsx');
    const storage = readSource('app/user/components/StorageManager.tsx');

    expect(libraryHeader).toContain("aria-label={_('Search library')}");
    expect(libraryHeader).toContain('h-11 min-h-11 w-11');
    expect(bookItem).toContain('sm:group-focus-within:opacity-100');
    expect(bookItem).toContain("aria-label={_('Transferring {{title}}'");
    expect(bookItem).toContain('aria-valuenow={transferProgress}');
    expect(storage).toContain("aria-label={_('Search files')}");
    expect(storage).toContain("aria-label={_('Sort files')}");
    expect(storage).toContain("{_('Select all files')}");
    expect(storage).toContain('aria-expanded={isExpanded}');
  });

  it('bounds shelf loading and disables scripted smooth scrolling for reduced-motion and e-ink', () => {
    const bookshelf = readSource('app/library/components/Bookshelf.tsx');
    const groupItem = readSource('app/library/components/GroupItem.tsx');

    expect(bookshelf).toContain("className='bookshelf relative min-h-0");
    expect(bookshelf).toContain("className='bg-base-100/80 absolute inset-0");
    expect(bookshelf).not.toContain("className='fixed inset-0 z-50");
    expect(groupItem).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(groupItem).toContain("dataset['eink'] === 'true'");
    expect(getBookshelfScrollBehavior(false, false)).toBe('smooth');
    expect(getBookshelfScrollBehavior(true, false)).toBe('auto');
    expect(getBookshelfScrollBehavior(false, true)).toBe('auto');
  });
});
