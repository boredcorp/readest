import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readerContext = vi.hoisted(() => ({ sideBarBookKey: 'book-key' as string | null }));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({ sideBarBookKey: readerContext.sideBarBookKey }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({
      book: {
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

vi.mock('@/integrations/learningbored/LearningBoredCapturePanel', () => ({
  default: ({
    onStartReview,
    onOpenProgress,
  }: {
    onStartReview?: (documentId: string) => void;
    onOpenProgress?: (documentId: string) => void;
  }) => (
    <aside aria-label='LearningBored Board panel'>
      <button type='button' onClick={() => onStartReview?.('document-fictional')}>
        Start review
      </button>
      <button type='button' onClick={() => onOpenProgress?.('document-fictional')}>
        Progress
      </button>
    </aside>
  ),
}));

vi.mock('@/integrations/learningbored/LearningBoredReviewPanel', () => ({
  default: ({
    documentId,
    conceptId,
    onClose,
    onOpenProgress,
  }: {
    documentId?: string;
    conceptId?: string;
    onClose: () => void;
    onOpenProgress?: (documentId: string) => void;
  }) => (
    <aside aria-label='LearningBored review panel'>
      <span>{documentId}</span>
      <span>{conceptId}</span>
      <button type='button' onClick={onClose}>
        Close review
      </button>
      <button type='button' onClick={() => documentId && onOpenProgress?.(documentId)}>
        View progress
      </button>
    </aside>
  ),
}));

vi.mock('@/integrations/learningbored/LearningBoredProgressPanel', () => ({
  default: ({
    documentId,
    onClose,
    onStartReview,
  }: {
    documentId: string;
    onClose: () => void;
    onStartReview: (documentId: string, conceptId: string) => void;
  }) => (
    <aside aria-label='LearningBored progress panel'>
      <span>{documentId}</span>
      <button type='button' onClick={onClose}>
        Close progress
      </button>
      <button type='button' onClick={() => onStartReview(documentId, 'concept-fictional')}>
        Review weak concept
      </button>
    </aside>
  ),
}));

import { publishLearningBoredCapture } from '@/integrations/learningbored/bridge';
import type { LearningBoredClient } from '@/integrations/learningbored/client';
import LearningBoredPanelHost from '@/integrations/learningbored/LearningBoredPanelHost';

function passage() {
  return {
    bookId: 'book-1',
    selectedText: 'A generic fictional passage for a review host test.',
    surroundingContext: 'A generic fictional passage for a review host test.',
    contextOffset: 0,
    location: {
      version: 1 as const,
      kind: 'cfi' as const,
      bookId: 'book-1',
      cfi: 'epubcfi(/6/2!/4/2/1:0)',
      pageIndex: 0,
    },
  };
}

describe('LearningBored review host', () => {
  beforeEach(() => {
    readerContext.sideBarBookKey = 'book-key';
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('keeps review mounted when the capture document becomes unavailable', () => {
    const client = {} as LearningBoredClient;
    const rendered = render(<LearningBoredPanelHost client={client} />);

    act(() => {
      publishLearningBoredCapture({ bookKey: 'book-key', passage: passage() });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
    expect(screen.getByRole('complementary', { name: 'LearningBored review panel' })).toBeTruthy();
    expect(screen.getByText('document-fictional')).toBeTruthy();

    act(() => {
      readerContext.sideBarBookKey = null;
      rendered.rerender(<LearningBoredPanelHost client={client} />);
    });

    expect(screen.getByRole('complementary', { name: 'LearningBored review panel' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'LearningBored Board panel' })).toBeNull();
  });

  it('opens progress from a completed Board and starts concept-scoped review', () => {
    const client = {} as LearningBoredClient;
    render(<LearningBoredPanelHost client={client} />);

    act(() => {
      publishLearningBoredCapture({ bookKey: 'book-key', passage: passage() });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
    expect(
      screen.getByRole('complementary', { name: 'LearningBored progress panel' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Review weak concept' }));
    expect(screen.getByRole('complementary', { name: 'LearningBored review panel' })).toBeTruthy();
    expect(screen.getByText('concept-fictional')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View progress' }));
    expect(
      screen.getByRole('complementary', { name: 'LearningBored progress panel' }),
    ).toBeTruthy();
  });
});
