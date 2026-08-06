import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';

import type { LearningBoredClient } from '@/integrations/learningbored/client';
import type { LearningBoredDocumentSummary } from '@/integrations/learningbored/client';
import { LearningBoredClientProvider } from '@/integrations/learningbored/LearningBoredClientContext';
import LearningBoredLibraryPresentation, {
  LearningBoredLibrarySurface,
} from '@/integrations/learningbored/presentation/LearningBoredLibraryPresentation';
import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import type { SystemSettings } from '@/types/settings';
import type { Book } from '@/types/book';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string, values?: Record<string, string | number>) => {
    if (!values) return message;
    return Object.entries(values).reduce(
      (result, [key, value]) => result.replace(`{{${key}}}`, String(value)),
      message,
    );
  },
}));

function clientWithListDocuments(
  listDocuments: LearningBoredClient['listDocuments'],
): LearningBoredClient {
  return { listDocuments } as unknown as LearningBoredClient;
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

beforeEach(() => {
  useThemeStore.setState({ isDarkMode: false });
  useSettingsStore.setState({ settings: {} as SystemSettings });
});

afterEach(() => cleanup());

describe('LearningBored library presentation isolation', () => {
  it('owns one named Operate work plane and heading', () => {
    render(
      <LearningBoredLibrarySurface
        pageRef={createRef<HTMLDivElement>()}
        title='Your Library'
        controlBar={<div>Library controls</div>}
        busy={false}
        syncing={false}
        syncProgress={0}
        documentCount={1}
        dueCount={3}
        enrichmentStatus='available'
      >
        <section aria-label='Bookshelf'>Fictional shelf</section>
      </LearningBoredLibrarySurface>,
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main', { name: 'Your Library' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Your Library' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('3 reviews due');
  });

  it('does not request LearningBored enrichment when Readest is selected', async () => {
    const listDocuments = vi.fn<LearningBoredClient['listDocuments']>();
    const client = clientWithListDocuments(listDocuments);

    render(
      <LearningBoredClientProvider value={client}>
        <SelectedRoutePresentation
          presentation='readest'
          readest={<p>Readest library</p>}
          learningbored={
            <LearningBoredLibraryPresentation>
              {() => <p>LearningBored library</p>}
            </LearningBoredLibraryPresentation>
          }
        />
      </LearningBoredClientProvider>,
    );

    expect(screen.getByText('Readest library')).toBeTruthy();
    await waitFor(() => expect(listDocuments).not.toHaveBeenCalled());
  });

  it('keeps local library actions mounted when enrichment fails', async () => {
    const listDocuments = vi
      .fn<LearningBoredClient['listDocuments']>()
      .mockRejectedValue(new Error('Synthetic offline failure'));
    const localAction = vi.fn();

    render(
      <LearningBoredClientProvider value={clientWithListDocuments(listDocuments)}>
        <LearningBoredLibraryPresentation>
          {(context) => (
            <div>
              <p>{context.enrichmentStatus}</p>
              <p>{context.dueCount === null ? 'Due count unavailable' : context.dueCount}</p>
              <button type='button' onClick={localAction}>
                Open local book
              </button>
            </div>
          )}
        </LearningBoredLibraryPresentation>
      </LearningBoredClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Open local book' })).toBeTruthy();
    await screen.findByText('unavailable');
    expect(screen.getByText('Due count unavailable')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open local book' }));
    expect(localAction).toHaveBeenCalledTimes(1);
  });

  it('adds delayed document status without reordering the canonical shelf', async () => {
    let resolveDocuments:
      | ((value: { documents: LearningBoredDocumentSummary[] }) => void)
      | undefined;
    const listDocuments = vi.fn<LearningBoredClient['listDocuments']>(
      () =>
        new Promise((resolve) => {
          resolveDocuments = resolve;
        }),
    );
    const quiet = { hash: 'book-quiet', title: 'Quiet book', format: 'EPUB' } as Book;
    const urgent = { hash: 'book-urgent', title: 'Urgent book', format: 'EPUB' } as Book;

    render(
      <LearningBoredClientProvider value={clientWithListDocuments(listDocuments)}>
        <LearningBoredLibraryPresentation>
          {(context) => (
            <>
              <p>{context.enrichmentStatus}</p>
              <ol aria-label='Canonical shelf'>
                {[quiet, urgent].map((book) => (
                  <li key={book.hash}>
                    <span>{book.title}</span>
                    {context.bookshelfPresentation.presentItem?.(book)?.status}
                  </li>
                ))}
              </ol>
            </>
          )}
        </LearningBoredLibraryPresentation>
      </LearningBoredClientProvider>,
    );

    const itemTitles = () =>
      Array.from(screen.getByRole('list', { name: 'Canonical shelf' }).children).map(
        (item) => item.querySelector('span')?.textContent,
      );
    expect(itemTitles()).toEqual(['Quiet book', 'Urgent book']);

    await act(async () => {
      resolveDocuments?.({ documents: [document('book-urgent', 5)] });
    });

    await screen.findByText('available');
    expect(screen.getByText('5 due')).toBeTruthy();
    expect(itemTitles()).toEqual(['Quiet book', 'Urgent book']);
  });

  it('maps the Reader dark and e-ink settings onto the selected presentation root', () => {
    const listDocuments = vi.fn(async () => ({ documents: [] }));

    useThemeStore.setState({ isDarkMode: true });
    const dark = render(
      <LearningBoredClientProvider value={clientWithListDocuments(listDocuments)}>
        <LearningBoredLibraryPresentation>Library</LearningBoredLibraryPresentation>
      </LearningBoredClientProvider>,
    );
    expect(
      dark.container
        .querySelector('[data-lb-presentation="library"]')
        ?.getAttribute('data-lb-theme'),
    ).toBe('dark');

    dark.unmount();
    useThemeStore.setState({ isDarkMode: false });
    useSettingsStore.setState({
      settings: { globalViewSettings: { isEink: true } } as SystemSettings,
    });
    const eink = render(
      <LearningBoredClientProvider value={clientWithListDocuments(listDocuments)}>
        <LearningBoredLibraryPresentation>Library</LearningBoredLibraryPresentation>
      </LearningBoredClientProvider>,
    );
    expect(
      eink.container
        .querySelector('[data-lb-presentation="library"]')
        ?.getAttribute('data-lb-theme'),
    ).toBe('eink');
  });
});
