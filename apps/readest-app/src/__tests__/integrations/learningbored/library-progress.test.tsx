import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
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
  useLongPress: () => ({ pressing: false, handlers: {} }),
}));

vi.mock('@/app/library/components/BookItem', () => ({
  default: () => <span>Fictional book row</span>,
}));

import BookshelfItem from '@/app/library/components/BookshelfItem';
import LearningBoredLibraryStatus from '@/integrations/learningbored/LearningBoredLibraryStatus';
import {
  getLearningBoredDocumentForBook,
  sortLearningBoredLibraryItemsByAttention,
} from '@/integrations/learningbored/library';
import type { LearningBoredDocumentSummary } from '@/integrations/learningbored/client';
import type { Book, BooksGroup } from '@/types/book';

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
  it('stably brings due books and groups forward by attention', () => {
    const quiet = book('book-quiet', 'Quiet book');
    const urgent = book('book-urgent', 'Urgent book');
    const medium = book('book-medium', 'Medium book');
    const group = {
      id: 'group-1',
      name: 'Fictional group',
      displayName: 'Fictional group',
      books: [quiet, medium],
      updatedAt: 1,
    } as BooksGroup;
    const documents = new Map([
      ['book-quiet', document('book-quiet', 0)],
      ['book-urgent', document('book-urgent', 5)],
      ['book-medium', document('book-medium', 2)],
    ]);

    const sorted = sortLearningBoredLibraryItemsByAttention([quiet, group, urgent], documents);
    expect(sorted.map((item) => ('format' in item ? item.hash : item.id))).toEqual([
      'book-urgent',
      'group-1',
      'book-quiet',
    ]);
    expect((sorted[1] as BooksGroup).books.map((item) => item.hash)).toEqual([
      'book-medium',
      'book-quiet',
    ]);
    expect(getLearningBoredDocumentForBook(urgent, documents)?.dueCount).toBe(5);
  });

  it('shows explicit due and zero states while leaving unmapped books blank', () => {
    const due = document('book-due', 3);
    const { rerender } = render(<LearningBoredLibraryStatus document={due} />);
    expect(screen.getByText('3 due')).toBeTruthy();
    expect(screen.getByText('2 Boards')).toBeTruthy();

    rerender(<LearningBoredLibraryStatus document={{ ...due, dueCount: 0 }} />);
    expect(screen.getByText('Nothing due')).toBeTruthy();

    rerender(<LearningBoredLibraryStatus document={null} />);
    expect(screen.queryByText('Nothing due')).toBeNull();
  });

  it('includes due and Board status in the outer bookshelf control accessible name', () => {
    const due = document('book-due', 3);
    render(
      <BookshelfItem
        mode='list'
        item={book('book-due', 'Fictional operations guide')}
        coverFit='crop'
        isSelectMode={false}
        itemSelected={false}
        transferProgress={null}
        learningBoredDocument={due}
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
      screen.getByRole('button', {
        name: 'Fictional operations guide. 3 due. 2 Boards',
      }),
    ).toBeTruthy();
  });
});
