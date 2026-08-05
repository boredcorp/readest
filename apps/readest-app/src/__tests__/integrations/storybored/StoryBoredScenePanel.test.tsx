import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoryBoredPassage, StoryBoredSceneGeneration } from '@/integrations/storybored/types';

const authMocks = vi.hoisted(() => ({
  current: {
    isReady: true,
    token: 'account-a-token' as string | null,
    user: { id: 'account-a' } as User | null,
  },
}));

const clientMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

const sessionMocks = vi.hoisted(() => ({
  clear: vi.fn(),
  write: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => authMocks.current,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@/integrations/storybored/client', () => ({
  createStoryBoredReaderClient: (options: unknown) => clientMocks.createClient(options),
  isStoryBoredReaderEnabled: () => true,
}));

vi.mock('@/integrations/storybored/StoryBoredLogo', () => ({
  StoryBoredLogoMarkIcon: () => null,
}));

vi.mock('@/integrations/storybored/session', () => ({
  clearStoryBoredSceneSession: sessionMocks.clear,
  isStoryBoredSceneActive: (status: string) =>
    status === 'queued' || status === 'prompting' || status === 'generating',
  writeStoryBoredSceneSession: sessionMocks.write,
}));

import StoryBoredScenePanel from '@/integrations/storybored/StoryBoredScenePanel';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function generation(id: string, status: StoryBoredSceneGeneration['status'], bookId = 'book-1') {
  return {
    id,
    status,
    bookId,
    prompt: 'A lantern-lit path through the woods.',
    createdAt: '2026-08-03T00:00:00.000Z',
  } satisfies StoryBoredSceneGeneration;
}

const passage: StoryBoredPassage = {
  bookId: 'book-1',
  selectedText: 'The lantern revealed a path beneath the silver leaves.',
  stylePreset: 'cinematic-literary',
};

function readerClient(overrides: Record<string, unknown> = {}) {
  return {
    cancelSceneGeneration: vi.fn(),
    createSceneGeneration: vi.fn(),
    getSceneGeneration: vi.fn(),
    listBookSceneGenerations: vi.fn().mockResolvedValue([]),
    retrySceneGeneration: vi.fn(),
    submitFeedback: vi.fn(),
    ...overrides,
  };
}

describe('StoryBored scene panel auth epoch', () => {
  beforeEach(() => {
    authMocks.current = {
      isReady: true,
      token: 'account-a-token',
      user: { id: 'account-a' } as User,
    };
    clientMocks.createClient.mockReset().mockReturnValue(readerClient());
    sessionMocks.clear.mockReset();
    sessionMocks.write.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('waits for initial auth resolution before clearing scene state', () => {
    authMocks.current = {
      isReady: false,
      token: null,
      user: null,
    };
    const view = render(<StoryBoredScenePanel isOpen passage={passage} onClose={vi.fn()} />);

    expect(sessionMocks.clear).not.toHaveBeenCalled();

    authMocks.current = {
      isReady: true,
      token: 'account-a-token',
      user: { id: 'account-a' } as User,
    };
    view.rerender(<StoryBoredScenePanel isOpen passage={passage} onClose={vi.fn()} />);

    expect(sessionMocks.clear).not.toHaveBeenCalled();
  });

  it('rejects and clears a restored generation that belongs to another book', async () => {
    const mismatchedGeneration = generation('generation-1', 'queued', 'book-1');
    clientMocks.createClient.mockReturnValue(
      readerClient({ getSceneGeneration: vi.fn().mockResolvedValue(mismatchedGeneration) }),
    );
    const otherPassage = { ...passage, bookId: 'book-2' };
    const onGenerationChange = vi.fn();

    render(
      <StoryBoredScenePanel
        isOpen
        passage={otherPassage}
        generationId='generation-1'
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(sessionMocks.clear).toHaveBeenCalledWith('generation-1');
    });
    expect(sessionMocks.write).not.toHaveBeenCalled();
    expect(onGenerationChange).toHaveBeenCalledWith(null);
    expect(screen.queryByText('Queued')).toBeNull();
  });

  it('writes only a matching active generation without erasing it for a replacement passage', async () => {
    const activeGeneration = generation('generation-1', 'queued');
    clientMocks.createClient.mockReturnValue(
      readerClient({ getSceneGeneration: vi.fn().mockResolvedValue(activeGeneration) }),
    );
    const onGenerationChange = vi.fn();

    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId='generation-1'
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(sessionMocks.write).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerUserId: 'account-a',
          bookId: 'book-1',
          generationId: 'generation-1',
          passage,
        }),
      );
    });

    sessionMocks.clear.mockClear();
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={{ ...passage, selectedText: 'A newly selected passage.' }}
        generationId='generation-1'
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('A newly selected passage.')).toBeTruthy());
    expect(sessionMocks.write).toHaveBeenCalledTimes(1);
    expect(sessionMocks.clear).not.toHaveBeenCalledWith('generation-1');
  });

  it('keeps a completed generation in the durable reader session', async () => {
    const completedGeneration = generation('generation-1', 'completed');
    clientMocks.createClient.mockReturnValue(
      readerClient({ getSceneGeneration: vi.fn().mockResolvedValue(completedGeneration) }),
    );

    render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId='generation-1'
        onGenerationChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(sessionMocks.write).toHaveBeenCalledWith(
        expect.objectContaining({
          generationId: 'generation-1',
          generationStatus: 'completed',
        }),
      );
    });
    expect(sessionMocks.clear).not.toHaveBeenCalledWith('generation-1');
  });

  it('discovers completed book history while closed and restores it when opened', async () => {
    const completedGeneration = generation('generation-history', 'completed');
    const listBookSceneGenerations = vi.fn().mockResolvedValue([completedGeneration]);
    clientMocks.createClient.mockReturnValue(readerClient({ listBookSceneGenerations }));
    const onHistoryChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen={false}
        bookId='book-1'
        passage={null}
        onHistoryChange={onHistoryChange}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listBookSceneGenerations).toHaveBeenCalledWith('book-1');
      expect(onHistoryChange).toHaveBeenCalledWith(true, false);
    });
    expect(screen.queryByRole('complementary')).toBeNull();

    view.rerender(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={null}
        onHistoryChange={onHistoryChange}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(listBookSceneGenerations).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Scene image expired')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh scene history' }));
    await waitFor(() => expect(listBookSceneGenerations).toHaveBeenCalledTimes(3));
  });

  it('reports a closed-panel discovery failure so the reader can expose a retry affordance', async () => {
    clientMocks.createClient.mockReturnValue(
      readerClient({
        listBookSceneGenerations: vi.fn().mockRejectedValue(new Error('History unavailable')),
      }),
    );
    const onHistoryChange = vi.fn();

    render(
      <StoryBoredScenePanel
        isOpen={false}
        bookId='book-1'
        passage={null}
        onHistoryChange={onHistoryChange}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(onHistoryChange).toHaveBeenCalledWith(false, true));
  });

  it('keeps a newly selected passage ready to generate while still showing its book history', async () => {
    const completedGeneration = generation('generation-history', 'completed');
    const listBookSceneGenerations = vi.fn().mockResolvedValue([completedGeneration]);
    clientMocks.createClient.mockReturnValue(readerClient({ listBookSceneGenerations }));

    render(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={passage}
        onHistoryChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(listBookSceneGenerations).toHaveBeenCalledWith('book-1'));
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open saved scene/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save feedback' })).toBeNull();
  });

  it('keeps a history selection detached from an unrelated restored passage', async () => {
    const restoredGeneration = {
      ...generation('generation-restored', 'completed'),
      selectedTextPreview: 'The restored passage.',
    };
    const historyGeneration = {
      ...generation('generation-history', 'completed'),
      selectedTextPreview: 'A different historical passage.',
    };
    clientMocks.createClient.mockReturnValue(
      readerClient({
        getSceneGeneration: vi.fn(async (id: string) =>
          id === restoredGeneration.id ? restoredGeneration : historyGeneration,
        ),
        listBookSceneGenerations: vi
          .fn()
          .mockResolvedValue([restoredGeneration, historyGeneration]),
      }),
    );
    const onHistoryChange = vi.fn();
    const onClose = vi.fn();

    function HistorySelectionHarness() {
      const [currentGenerationId, setCurrentGenerationId] = useState(restoredGeneration.id);
      const handleGenerationChange = useCallback(
        (nextGeneration: StoryBoredSceneGeneration | null) =>
          setCurrentGenerationId(nextGeneration?.id ?? ''),
        [],
      );
      return (
        <StoryBoredScenePanel
          isOpen
          bookId='book-1'
          passage={passage}
          generationId={currentGenerationId}
          onGenerationChange={handleGenerationChange}
          onHistoryChange={onHistoryChange}
          onClose={onClose}
        />
      );
    }

    render(<HistorySelectionHarness />);
    fireEvent.click(await screen.findByRole('button', { name: /A different historical passage/ }));

    await waitFor(() => {
      expect(screen.getAllByText('A different historical passage.')).toHaveLength(2);
    });
    expect(screen.queryByText(passage.selectedText)).toBeNull();
    expect(sessionMocks.write).not.toHaveBeenCalledWith(
      expect.objectContaining({ generationId: historyGeneration.id, passage }),
    );
  });

  it('does not let a pending history refresh override a newer row selection', async () => {
    const activeGeneration = {
      ...generation('generation-active', 'generating'),
      selectedTextPreview: 'The active passage.',
    };
    const selectedGeneration = {
      ...generation('generation-selected', 'completed'),
      selectedTextPreview: 'The scene selected during refresh.',
    };
    const replacementGeneration = {
      ...generation('generation-replacement', 'completed'),
      selectedTextPreview: 'A stale refresh replacement.',
    };
    const pendingRefresh = deferred<StoryBoredSceneGeneration[]>();
    const listBookSceneGenerations = vi
      .fn()
      .mockResolvedValueOnce([activeGeneration, selectedGeneration])
      .mockImplementationOnce(() => pendingRefresh.promise);
    clientMocks.createClient.mockReturnValue(readerClient({ listBookSceneGenerations }));

    render(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={null}
        onGenerationChange={vi.fn()}
        onHistoryChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const selectedRow = await screen.findByRole('button', {
      name: /The scene selected during refresh/,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh scene history' }));
    fireEvent.click(selectedRow);

    await act(async () => {
      pendingRefresh.resolve([activeGeneration, replacementGeneration]);
      await pendingRefresh.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('The scene selected during refresh.')).toBeTruthy();
    });
    expect(screen.queryByText('A stale refresh replacement.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeTruthy();
  });

  it('discards an expired-URL history selection after the reader passage changes', async () => {
    const expiredGeneration = {
      ...generation('generation-expired-selection', 'completed'),
      selectedTextPreview: 'The historical passage.',
      image: {
        id: 'image-expired-selection',
        generationId: 'generation-expired-selection',
        url: 'https://assets.example.test/expired-selection.png',
        urlExpiresAt: '2026-08-01T00:05:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    } satisfies StoryBoredSceneGeneration;
    const refreshedGeneration = {
      ...expiredGeneration,
      image: {
        ...expiredGeneration.image,
        url: 'https://assets.example.test/refreshed-selection.png',
        urlExpiresAt: '2099-08-01T00:05:00.000Z',
      },
    } satisfies StoryBoredSceneGeneration;
    const pendingRefresh = deferred<StoryBoredSceneGeneration>();
    clientMocks.createClient.mockReturnValue(
      readerClient({
        getSceneGeneration: vi.fn(() => pendingRefresh.promise),
        listBookSceneGenerations: vi.fn().mockResolvedValue([expiredGeneration]),
      }),
    );
    const onGenerationChange = vi.fn();
    const onHistoryChange = vi.fn();
    const onClose = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={passage}
        onGenerationChange={onGenerationChange}
        onHistoryChange={onHistoryChange}
        onClose={onClose}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /The historical passage/ }));
    const replacementPassage = {
      ...passage,
      selectedText: 'A newly selected passage while history refreshes.',
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={replacementPassage}
        onGenerationChange={onGenerationChange}
        onHistoryChange={onHistoryChange}
        onClose={onClose}
      />,
    );

    await act(async () => {
      pendingRefresh.resolve(refreshedGeneration);
      await pendingRefresh.promise;
    });

    expect(screen.getByText(replacementPassage.selectedText)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
    expect(onGenerationChange).not.toHaveBeenCalledWith(refreshedGeneration);
  });

  it('refetches a completed generation when its signed image URL has expired', async () => {
    const expiredGeneration = {
      ...generation('generation-history', 'completed'),
      image: {
        id: 'image-1',
        generationId: 'generation-history',
        url: 'https://assets.example.test/expired.png',
        urlExpiresAt: '2026-08-01T00:05:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    } satisfies StoryBoredSceneGeneration;
    const refreshedGeneration = {
      ...expiredGeneration,
      image: {
        ...expiredGeneration.image,
        url: 'https://assets.example.test/refreshed.png',
        urlExpiresAt: '2099-08-01T00:05:00.000Z',
      },
    } satisfies StoryBoredSceneGeneration;
    const getSceneGeneration = vi.fn().mockResolvedValue(refreshedGeneration);
    clientMocks.createClient.mockReturnValue(
      readerClient({
        getSceneGeneration,
        listBookSceneGenerations: vi.fn().mockResolvedValue([expiredGeneration]),
      }),
    );

    render(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={null}
        onHistoryChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(getSceneGeneration).toHaveBeenCalledWith('generation-history'));
    expect((await screen.findByAltText('Generated scene')).getAttribute('src')).toBe(
      'https://assets.example.test/refreshed.png',
    );
  });

  it('caps consecutive signed-URL recovery attempts for a scene image', async () => {
    const initialGeneration = {
      ...generation('generation-history', 'completed'),
      image: {
        id: 'image-1',
        generationId: 'generation-history',
        url: 'https://assets.example.test/initial.png',
        urlExpiresAt: '2099-08-01T00:05:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    } satisfies StoryBoredSceneGeneration;
    const refreshedGeneration = {
      ...initialGeneration,
      image: {
        ...initialGeneration.image,
        url: 'https://assets.example.test/refreshed-on-error.png',
      },
    } satisfies StoryBoredSceneGeneration;
    const secondRefreshGeneration = {
      ...refreshedGeneration,
      image: {
        ...refreshedGeneration.image,
        url: 'https://assets.example.test/second-refresh.png',
      },
    } satisfies StoryBoredSceneGeneration;
    const getSceneGeneration = vi
      .fn()
      .mockResolvedValueOnce(refreshedGeneration)
      .mockResolvedValue(secondRefreshGeneration);
    clientMocks.createClient.mockReturnValue(
      readerClient({
        getSceneGeneration,
        listBookSceneGenerations: vi.fn().mockResolvedValue([initialGeneration]),
      }),
    );

    render(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={null}
        onHistoryChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const initialImage = await screen.findByAltText('Generated scene');
    fireEvent.error(initialImage);
    await waitFor(() => expect(getSceneGeneration).toHaveBeenCalledTimes(1));
    const refreshedImage = await screen.findByAltText('Generated scene');
    expect(refreshedImage.getAttribute('src')).toBe(
      'https://assets.example.test/refreshed-on-error.png',
    );

    fireEvent.error(refreshedImage);
    await waitFor(() => expect(getSceneGeneration).toHaveBeenCalledTimes(2));
    const secondRefreshImage = await screen.findByAltText('Generated scene');
    expect(secondRefreshImage.getAttribute('src')).toBe(
      'https://assets.example.test/second-refresh.png',
    );

    fireEvent.error(secondRefreshImage);
    expect(await screen.findByText('Scene image unavailable')).toBeTruthy();
    expect(getSceneGeneration).toHaveBeenCalledTimes(2);
  });

  it('discards a stale image refresh after navigating away and back', async () => {
    const initialGeneration = {
      ...generation('generation-history', 'completed'),
      image: {
        id: 'image-1',
        generationId: 'generation-history',
        url: 'https://assets.example.test/initial.png',
        urlExpiresAt: '2099-08-01T00:05:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    } satisfies StoryBoredSceneGeneration;
    const refreshedGeneration = {
      ...initialGeneration,
      image: {
        ...initialGeneration.image,
        url: 'https://assets.example.test/stale-refresh.png',
      },
    } satisfies StoryBoredSceneGeneration;
    const pendingRefresh = deferred<StoryBoredSceneGeneration>();
    const getSceneGeneration = vi
      .fn()
      .mockResolvedValueOnce(initialGeneration)
      .mockImplementationOnce(() => pendingRefresh.promise);
    clientMocks.createClient.mockReturnValue(readerClient({ getSceneGeneration }));

    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId={initialGeneration.id}
        onGenerationChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const initialImage = await screen.findByAltText('Generated scene');
    fireEvent.error(initialImage);
    await waitFor(() => expect(getSceneGeneration).toHaveBeenCalledTimes(2));

    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={{ ...passage, selectedText: 'A temporary passage.' }}
        generationId={initialGeneration.id}
        onGenerationChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId={initialGeneration.id}
        onGenerationChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await act(async () => {
      pendingRefresh.resolve(refreshedGeneration);
      await pendingRefresh.promise;
    });

    expect((await screen.findByAltText('Generated scene')).getAttribute('src')).toBe(
      initialGeneration.image.url,
    );
  });

  it('refetches a lazy history thumbnail when its signed URL fails', async () => {
    const historyGeneration = {
      ...generation('generation-thumbnail', 'completed'),
      selectedTextPreview: 'A scene with a lazy thumbnail.',
      image: {
        id: 'image-thumbnail',
        generationId: 'generation-thumbnail',
        url: 'https://assets.example.test/full.png',
        thumbnailUrl: 'https://assets.example.test/thumbnail.png',
        urlExpiresAt: '2099-08-01T00:05:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    } satisfies StoryBoredSceneGeneration;
    const refreshedGeneration = {
      ...historyGeneration,
      image: {
        ...historyGeneration.image,
        thumbnailUrl: 'https://assets.example.test/refreshed-thumbnail.png',
      },
    } satisfies StoryBoredSceneGeneration;
    const getSceneGeneration = vi.fn().mockResolvedValue(refreshedGeneration);
    clientMocks.createClient.mockReturnValue(
      readerClient({
        getSceneGeneration,
        listBookSceneGenerations: vi.fn().mockResolvedValue([historyGeneration]),
      }),
    );

    const view = render(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={passage}
        onHistoryChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: /A scene with a lazy thumbnail/ });
    const thumbnail = view.container.querySelector<HTMLImageElement>('img[loading="lazy"]');
    expect(thumbnail?.src).toBe('https://assets.example.test/thumbnail.png');
    fireEvent.error(thumbnail as HTMLImageElement);

    await waitFor(() => expect(getSceneGeneration).toHaveBeenCalledWith('generation-thumbnail'));
    expect(view.container.querySelector<HTMLImageElement>('img[loading="lazy"]')?.src).toBe(
      'https://assets.example.test/refreshed-thumbnail.png',
    );
  });

  it('does not expose the previous owner generation after an account switch', async () => {
    const completedGeneration = generation('generation-1', 'completed');
    const accountAClient = readerClient({
      getSceneGeneration: vi.fn().mockResolvedValue(completedGeneration),
    });
    const accountBClient = readerClient();
    clientMocks.createClient.mockImplementation((options: { accessToken?: string }) =>
      options.accessToken === 'account-a-token' ? accountAClient : accountBClient,
    );
    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId='generation-1'
        onGenerationChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findAllByText('Completed');

    authMocks.current = {
      isReady: true,
      token: 'account-b-token',
      user: { id: 'account-b' } as User,
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId='generation-1'
        onGenerationChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText('Completed')).toBeNull();
    expect(screen.getByText('Choose a style and generate a scene.')).toBeTruthy();
  });

  it('discards a stale book-history response after an account switch', async () => {
    const accountAHistory = deferred<StoryBoredSceneGeneration[]>();
    const accountAClient = readerClient({
      listBookSceneGenerations: vi.fn(() => accountAHistory.promise),
    });
    const accountBClient = readerClient({
      listBookSceneGenerations: vi.fn().mockResolvedValue([]),
    });
    clientMocks.createClient.mockImplementation((options: { accessToken?: string }) =>
      options.accessToken === 'account-a-token' ? accountAClient : accountBClient,
    );
    const onHistoryChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={null}
        onHistoryChange={onHistoryChange}
        onClose={vi.fn()}
      />,
    );

    authMocks.current = {
      isReady: true,
      token: 'account-b-token',
      user: { id: 'account-b' } as User,
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        bookId='book-1'
        passage={null}
        onHistoryChange={onHistoryChange}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(accountBClient.listBookSceneGenerations).toHaveBeenCalled());

    await act(async () => {
      accountAHistory.resolve([
        {
          ...generation('account-a-history', 'completed'),
          selectedTextPreview: 'Account A private scene',
        },
      ]);
      await accountAHistory.promise;
    });

    expect(screen.queryByRole('button', { name: /Account A private scene/ })).toBeNull();
    expect(onHistoryChange).not.toHaveBeenCalledWith(true, false);
  });

  it('discards an in-flight generation after the selected passage changes', async () => {
    const pendingGeneration = deferred<StoryBoredSceneGeneration>();
    clientMocks.createClient.mockReturnValue(
      readerClient({ createSceneGeneration: vi.fn(() => pendingGeneration.promise) }),
    );
    const onGenerationChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    const replacementPassage = {
      ...passage,
      selectedText: 'A different passage beneath a different moon.',
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={replacementPassage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    const staleGeneration = generation('stale-generation', 'queued');
    await act(async () => {
      pendingGeneration.resolve(staleGeneration);
      await pendingGeneration.promise;
    });

    expect(onGenerationChange).not.toHaveBeenCalledWith(staleGeneration);
    expect(sessionMocks.write).not.toHaveBeenCalled();
    expect(screen.queryByText('Queued')).toBeNull();
  });

  it('discards an in-flight generation after a newer history generation is restored', async () => {
    const pendingGeneration = deferred<StoryBoredSceneGeneration>();
    const historyGeneration = {
      ...generation('history-generation', 'completed'),
      selectedTextPreview: 'The newer saved scene.',
    };
    const createSceneGeneration = vi.fn(() => pendingGeneration.promise);
    clientMocks.createClient.mockReturnValue(
      readerClient({
        createSceneGeneration,
        getSceneGeneration: vi.fn().mockResolvedValue(historyGeneration),
        listBookSceneGenerations: vi.fn().mockResolvedValue([historyGeneration]),
      }),
    );
    const onGenerationChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    const historyRow = await screen.findByRole('button', { name: /The newer saved scene/ });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect((historyRow as HTMLButtonElement).disabled).toBe(true);

    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId={historyGeneration.id}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(onGenerationChange).toHaveBeenCalledWith(historyGeneration));

    const staleGeneration = generation('stale-generated-scene', 'queued');
    await act(async () => {
      pendingGeneration.resolve(staleGeneration);
      await pendingGeneration.promise;
    });

    expect(onGenerationChange).not.toHaveBeenCalledWith(staleGeneration);
    expect(screen.getByText('The newer saved scene.')).toBeTruthy();
  });

  it('discards an account-A action result after switching to account B', async () => {
    const pendingGeneration = deferred<StoryBoredSceneGeneration>();
    const accountAClient = readerClient({
      createSceneGeneration: vi.fn(() => pendingGeneration.promise),
    });
    const accountBClient = readerClient();
    clientMocks.createClient.mockImplementation((options: { accessToken?: string }) =>
      options.accessToken === 'account-a-token' ? accountAClient : accountBClient,
    );
    const onGenerationChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    authMocks.current = {
      isReady: true,
      token: 'account-b-token',
      user: { id: 'account-b' } as User,
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    const accountAResult = generation('account-a-generation', 'queued');
    await act(async () => {
      pendingGeneration.resolve(accountAResult);
      await pendingGeneration.promise;
    });

    expect(onGenerationChange).not.toHaveBeenCalledWith(accountAResult);
  });

  it('keeps a successful action result when the same user token rotates', async () => {
    const pendingGeneration = deferred<StoryBoredSceneGeneration>();
    const originalTokenClient = readerClient({
      createSceneGeneration: vi.fn(() => pendingGeneration.promise),
    });
    const rotatedTokenClient = readerClient();
    clientMocks.createClient.mockImplementation((options: { accessToken?: string }) =>
      options.accessToken === 'account-a-token' ? originalTokenClient : rotatedTokenClient,
    );
    const onGenerationChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    authMocks.current = {
      isReady: true,
      token: 'account-a-rotated-token',
      user: { id: 'account-a' } as User,
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByRole('button', { name: 'Generating' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    const successfulResult = generation('account-a-generation', 'queued');
    await act(async () => {
      pendingGeneration.resolve(successfulResult);
      await pendingGeneration.promise;
    });

    expect(onGenerationChange).toHaveBeenCalledWith(successfulResult);
  });

  it('discards an action result after session loss even when the same account signs in again', async () => {
    const pendingGeneration = deferred<StoryBoredSceneGeneration>();
    const accountAClient = readerClient({
      createSceneGeneration: vi.fn(() => pendingGeneration.promise),
    });
    clientMocks.createClient.mockReturnValue(accountAClient);
    const onGenerationChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    authMocks.current = {
      isReady: true,
      token: null,
      user: null,
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );
    authMocks.current = {
      isReady: true,
      token: 'account-a-new-session-token',
      user: { id: 'account-a' } as User,
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    const staleResult = generation('stale-account-a-generation', 'queued');
    await act(async () => {
      pendingGeneration.resolve(staleResult);
      await pendingGeneration.promise;
    });

    expect(onGenerationChange).not.toHaveBeenCalledWith(staleResult);
  });

  it('does not apply feedback completion to a replacement passage and generation', async () => {
    const pendingFeedback = deferred<void>();
    const firstGeneration = generation('generation-1', 'completed');
    const replacementGeneration = generation('generation-2', 'completed');
    const client = readerClient({
      getSceneGeneration: vi
        .fn()
        .mockResolvedValueOnce(firstGeneration)
        .mockResolvedValueOnce(replacementGeneration),
      submitFeedback: vi.fn(() => pendingFeedback.promise),
    });
    clientMocks.createClient.mockReturnValue(client);
    const onGenerationChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId='generation-1'
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );
    await screen.findAllByText('Completed');

    fireEvent.click(screen.getByRole('button', { name: 'Matched' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(client.submitFeedback).toHaveBeenCalledWith(
      'generation-1',
      expect.objectContaining({ matchedScene: true }),
    );

    const replacementPassage = {
      ...passage,
      selectedText: 'A replacement passage for a second scene.',
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={replacementPassage}
        generationId='generation-2'
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(onGenerationChange).toHaveBeenCalledWith(replacementGeneration);
    });

    await act(async () => {
      pendingFeedback.resolve();
      await pendingFeedback.promise;
    });

    expect(screen.queryByText('Feedback saved')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeTruthy();
  });

  it('does not overlap polls or poll again after a terminal response', async () => {
    vi.useFakeTimers();
    const pendingPoll = deferred<StoryBoredSceneGeneration>();
    const initialGeneration = generation('generation-1', 'generating');
    const completedGeneration = generation('generation-1', 'completed');
    const getSceneGeneration = vi
      .fn()
      .mockResolvedValueOnce(initialGeneration)
      .mockImplementationOnce(() => pendingPoll.promise);
    clientMocks.createClient.mockReturnValue(readerClient({ getSceneGeneration }));
    const onGenerationChange = vi.fn();

    render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId='generation-1'
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(getSceneGeneration).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(6000);
      await Promise.resolve();
    });
    expect(getSceneGeneration).toHaveBeenCalledTimes(2);

    await act(async () => {
      pendingPoll.resolve(completedGeneration);
      await pendingPoll.promise;
    });
    expect(onGenerationChange).toHaveBeenCalledWith(completedGeneration);

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(getSceneGeneration).toHaveBeenCalledTimes(2);
  });

  it('discards an old-token polling result after token rotation', async () => {
    vi.useFakeTimers();
    const stalePoll = deferred<StoryBoredSceneGeneration>();
    const currentTokenLoad = deferred<StoryBoredSceneGeneration>();
    const initialGeneration = generation('generation-1', 'generating');
    const accountAClient = readerClient({
      getSceneGeneration: vi
        .fn()
        .mockResolvedValueOnce(initialGeneration)
        .mockImplementationOnce(() => stalePoll.promise),
    });
    const rotatedClient = readerClient({
      getSceneGeneration: vi.fn(() => currentTokenLoad.promise),
    });
    clientMocks.createClient.mockImplementation((options: { accessToken?: string }) =>
      options.accessToken === 'account-a-token' ? accountAClient : rotatedClient,
    );
    const onGenerationChange = vi.fn();
    const view = render(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId='generation-1'
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(onGenerationChange).toHaveBeenCalledWith(initialGeneration);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    authMocks.current = {
      isReady: true,
      token: 'account-a-rotated-token',
      user: { id: 'account-a' } as User,
    };
    view.rerender(
      <StoryBoredScenePanel
        isOpen
        passage={passage}
        generationId='generation-1'
        onGenerationChange={onGenerationChange}
        onClose={vi.fn()}
      />,
    );

    const staleResult = generation('generation-1', 'completed');
    await act(async () => {
      stalePoll.resolve(staleResult);
      await stalePoll.promise;
    });

    expect(onGenerationChange).not.toHaveBeenCalledWith(staleResult);
  });
});
