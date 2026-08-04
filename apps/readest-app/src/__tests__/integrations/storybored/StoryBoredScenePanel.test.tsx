import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
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

  it('writes only a matching active generation with its resolved owner', async () => {
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

    await waitFor(() => {
      expect(sessionMocks.clear).toHaveBeenCalledWith('generation-1');
    });
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
