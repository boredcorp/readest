import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string, values?: Record<string, string | number>) => {
    if (!values) return message;
    return Object.entries(values).reduce(
      (result, [key, value]) => result.replace(`{{${key}}}`, String(value)),
      message,
    );
  },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: null }),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({ updateBook: vi.fn() }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { localBooksDir: '', openBookInNewWindow: false } }),
}));

vi.mock('@/hooks/useAppRouter', () => ({
  useAppRouter: () => ({}),
}));

vi.mock('@/hooks/useLongPress', () => ({
  useLongPress: ({ onTap }: { onTap?: () => void }) => ({
    pressing: false,
    handlers: { onClick: onTap },
  }),
}));

const navigateToReader = vi.fn();

vi.mock('@/utils/nav', () => ({
  navigateToReader: (...args: unknown[]) => navigateToReader(...args),
  showReaderWindow: vi.fn(),
}));

vi.mock('@/app/library/components/BookItem', () => ({
  default: ({ book, showBookDetailsModal }: { book: Book; showBookDetailsModal: () => void }) => (
    <div>
      <span>Fictional book row</span>
      <button type='button' onClick={showBookDetailsModal}>
        Show Book Details: {book.title}
      </button>
    </div>
  ),
}));

import BookshelfItem from '@/app/library/components/BookshelfItem';
import LearningBoredLibraryStatus from '@/integrations/learningbored/presentation/LearningBoredLibraryStatus';
import type { LearningBoredDocumentSummary } from '@/integrations/learningbored/client';
import type { Book } from '@/types/book';

function book(hash: string, title: string): Book {
  return { hash, title, format: 'EPUB', updatedAt: 1 } as Book;
}

function document(readerBookId: string, dueCount: number): LearningBoredDocumentSummary {
  return {
    id: `document-${readerBookId}`,
    title: `Document ${readerBookId}`,
    author: null,
    format: 'EPUB',
    sourceType: 'upload',
    readerBookId,
    pageCount: null,
    blueprintId: null,
    boardCount: 2,
    recallItemCount: 5,
    dueCount,
    lastOpenedAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
  };
}

afterEach(() => cleanup());

describe('LearningBored library progress', () => {
  it('shows explicit due and zero states while leaving unmapped books blank', () => {
    const due = document('book-due', 3);
    const { rerender } = render(<LearningBoredLibraryStatus document={due} />);
    expect(screen.getByText('3 due')).toBeTruthy();
    expect(screen.getByText('2 Boards')).toBeTruthy();
    expect(screen.getByText('5 recall items')).toBeTruthy();

    rerender(<LearningBoredLibraryStatus document={{ ...due, dueCount: 0 }} />);
    expect(screen.getByText('Nothing due')).toBeTruthy();

    rerender(<LearningBoredLibraryStatus document={null} />);
    expect(screen.queryByText('Nothing due')).toBeNull();
  });

  it('keeps the native open target separate from sibling item actions', async () => {
    const showDetails = vi.fn();
    render(
      <BookshelfItem
        mode='list'
        item={book('book-due', 'Fictional operations guide')}
        coverFit='crop'
        isSelectMode={false}
        itemSelected={false}
        transferProgress={null}
        accessibleDescription='3 due. 2 Boards. 5 recall items'
        setLoading={vi.fn()}
        toggleSelection={vi.fn()}
        handleGroupBooks={vi.fn()}
        handleBookDownload={vi.fn(async () => true)}
        handleBookUpload={vi.fn(async () => true)}
        handleBookDelete={vi.fn(async () => true)}
        handleSetSelectMode={vi.fn()}
        handleShowDetailsBook={showDetails}
        handleLibraryNavigation={vi.fn()}
        handleUpdateReadingStatus={vi.fn()}
      />,
    );

    const openTarget = screen.getByRole('button', {
      name: 'Fictional operations guide. 3 due. 2 Boards. 5 recall items',
    });
    const detailsTarget = screen.getByRole('button', {
      name: 'Show Book Details: Fictional operations guide',
    });
    const itemGroup = screen.getByRole('group', {
      name: 'Fictional operations guide. 3 due. 2 Boards. 5 recall items',
    });

    expect(openTarget.tagName).toBe('BUTTON');
    expect(itemGroup.contains(openTarget)).toBe(true);
    expect(openTarget.contains(detailsTarget)).toBe(false);

    fireEvent.click(detailsTarget);
    expect(showDetails).toHaveBeenCalledTimes(1);
    expect(navigateToReader).not.toHaveBeenCalled();

    fireEvent.click(openTarget);
    await waitFor(() => expect(navigateToReader).toHaveBeenCalledTimes(1));
  });

  it('announces selection intent and state on the native item control', () => {
    const { rerender } = render(
      <BookshelfItem
        mode='list'
        item={book('book-select', 'Fictional field notes')}
        coverFit='crop'
        isSelectMode
        itemSelected={false}
        transferProgress={null}
        setLoading={vi.fn()}
        toggleSelection={vi.fn()}
        handleGroupBooks={vi.fn()}
        handleBookDownload={vi.fn(async () => true)}
        handleBookUpload={vi.fn(async () => true)}
        handleBookDelete={vi.fn(async () => true)}
        handleSetSelectMode={vi.fn()}
        handleShowDetailsBook={vi.fn()}
        handleLibraryNavigation={vi.fn()}
        handleUpdateReadingStatus={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: 'Select Book: Fictional field notes' })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    rerender(
      <BookshelfItem
        mode='list'
        item={book('book-select', 'Fictional field notes')}
        coverFit='crop'
        isSelectMode
        itemSelected
        transferProgress={null}
        setLoading={vi.fn()}
        toggleSelection={vi.fn()}
        handleGroupBooks={vi.fn()}
        handleBookDownload={vi.fn(async () => true)}
        handleBookUpload={vi.fn(async () => true)}
        handleBookDelete={vi.fn(async () => true)}
        handleSetSelectMode={vi.fn()}
        handleShowDetailsBook={vi.fn()}
        handleLibraryNavigation={vi.fn()}
        handleUpdateReadingStatus={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: 'Deselect Book: Fictional field notes' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
