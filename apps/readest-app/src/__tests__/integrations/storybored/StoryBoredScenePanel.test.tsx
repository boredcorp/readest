import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  clearStoryBoredSceneSession: vi.fn(),
  isStoryBoredSceneActive: (status: string) =>
    status === 'queued' || status === 'prompting' || status === 'generating',
  writeStoryBoredSceneSession: vi.fn(),
}));

import StoryBoredScenePanel from '@/integrations/storybored/StoryBoredScenePanel';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function generation(id: string, status: StoryBoredSceneGeneration['status']) {
  return {
    id,
    status,
    bookId: 'book-1',
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
    clientMocks.createClient.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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
