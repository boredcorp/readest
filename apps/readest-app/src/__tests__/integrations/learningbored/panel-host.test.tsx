import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readerContext = vi.hoisted(() => ({ sideBarBookKey: 'book-key' }));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({ sideBarBookKey: readerContext.sideBarBookKey }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: (bookKey: string) => ({
      book:
        bookKey === 'book-key-b'
          ? {
              hash: 'book-2',
              title: 'Second fictional lesson',
              author: 'B. Example',
              format: 'EPUB',
            }
          : {
              hash: 'book-1',
              title: 'Fictional systems lesson',
              author: 'A. Example',
              format: 'EPUB',
            },
    }),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ getView: () => null }),
}));

import { publishLearningBoredCapture } from '@/integrations/learningbored/bridge';
import LearningBoredPanelHost from '@/integrations/learningbored/LearningBoredPanelHost';
import {
  readLearningBoredReaderSession,
  writeLearningBoredReaderSession,
} from '@/integrations/learningbored/session';

function createPassage(selectedText: string) {
  return {
    bookId: 'book-1',
    selectedText,
    surroundingContext: `Before ${selectedText} after`,
    contextOffset: 7,
    location: {
      version: 1 as const,
      kind: 'cfi' as const,
      bookId: 'book-1',
      cfi: 'epubcfi(/6/2!/4/2/1:0)',
      pageIndex: 0,
    },
  };
}

describe('LearningBored panel host', () => {
  beforeEach(() => {
    readerContext.sideBarBookKey = 'book-key';
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('owns one panel, replaces its capture, and restores it from a persisted close state', () => {
    const rendered = render(<LearningBoredPanelHost client={null} />);

    act(() => {
      publishLearningBoredCapture({
        bookKey: 'book-key',
        passage: createPassage('First generic selected passage.'),
      });
    });
    const panels = screen.getAllByRole('complementary', { name: 'LearningBored Board panel' });
    expect(panels).toHaveLength(1);
    expect(panels[0]?.getAttribute('data-lb-work-surface-height')).toBe('study');
    expect(panels[0]?.hasAttribute('aria-modal')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Close LearningBored Board panel' })).toBeNull();
    expect(screen.getByText('First generic selected passage.')).toBeTruthy();

    act(() => {
      publishLearningBoredCapture({
        bookKey: 'book-key',
        passage: createPassage('Replacement generic selected passage.'),
      });
    });
    expect(
      screen.getAllByRole('complementary', { name: 'LearningBored Board panel' }),
    ).toHaveLength(1);
    expect(screen.queryByText('First generic selected passage.')).toBeNull();
    expect(screen.getByText('Replacement generic selected passage.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close LearningBored panel' }));
    expect(screen.queryByRole('complementary', { name: 'LearningBored Board panel' })).toBeNull();
    expect(readLearningBoredReaderSession('book-1')?.panelOpen).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Open LearningBored Board panel' }));
    expect(screen.getByRole('complementary', { name: 'LearningBored Board panel' })).toBeTruthy();
    expect(readLearningBoredReaderSession('book-1')).toMatchObject({
      version: 2,
      generationId: null,
      boardId: null,
      showScaffold: true,
      kind: null,
      panelOpen: true,
    });

    const persistedSession = readLearningBoredReaderSession('book-1');
    expect(persistedSession).not.toBeNull();
    writeLearningBoredReaderSession({
      ...persistedSession!,
      generationId: 'generation-persisted',
      boardId: 'board-persisted',
    });
    rendered.unmount();
    render(<LearningBoredPanelHost client={null} />);
    expect(
      screen.getAllByRole('complementary', { name: 'LearningBored Board panel' }),
    ).toHaveLength(1);
    expect(screen.getByText('Replacement generic selected passage.')).toBeTruthy();
    expect(readLearningBoredReaderSession('book-1')).toMatchObject({
      generationId: 'generation-persisted',
      boardId: 'board-persisted',
      panelOpen: true,
    });
  });

  it('never carries an open Board into a different active book', () => {
    const rendered = render(<LearningBoredPanelHost client={null} />);

    act(() => {
      publishLearningBoredCapture({
        bookKey: 'book-key',
        passage: createPassage('A passage that belongs only to the first book.'),
      });
    });
    expect(screen.getByText('A passage that belongs only to the first book.')).toBeTruthy();

    act(() => {
      readerContext.sideBarBookKey = 'book-key-b';
      rendered.rerender(<LearningBoredPanelHost client={null} />);
    });

    expect(screen.queryByRole('complementary', { name: 'LearningBored Board panel' })).toBeNull();
    expect(screen.queryByText('A passage that belongs only to the first book.')).toBeNull();

    act(() => {
      readerContext.sideBarBookKey = 'book-key';
      rendered.rerender(<LearningBoredPanelHost client={null} />);
    });
    expect(screen.getByText('A passage that belongs only to the first book.')).toBeTruthy();
  });
});
