import { afterEach, describe, expect, it, vi } from 'vitest';

const AUTH_REQUIRED_MESSAGE = 'StoryBored authentication is required.';

describe('StoryBored reader client authentication', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('rejects every protected operation before networking when no access token exists', async () => {
    vi.stubEnv('NEXT_PUBLIC_STORYBORED_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_STORYBORED_API_BASE_URL', 'https://api.storybored.test');
    const { createStoryBoredReaderClient } = await import('@/integrations/storybored/client');
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = createStoryBoredReaderClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const protectedOperations: Array<{ name: string; request: () => Promise<unknown> }> = [
      {
        name: 'create scene generation',
        request: () =>
          client.createSceneGeneration({
            bookId: 'book-1',
            selectedText: 'The lantern revealed a hidden path beneath the silver leaves.',
            stylePreset: 'cinematic-literary',
          }),
      },
      { name: 'get scene generation', request: () => client.getSceneGeneration('generation-1') },
      {
        name: 'list book scene generations',
        request: () => client.listBookSceneGenerations('book-1'),
      },
      {
        name: 'cancel scene generation',
        request: () => client.cancelSceneGeneration('generation-1'),
      },
      {
        name: 'retry scene generation',
        request: () => client.retrySceneGeneration('generation-1'),
      },
      {
        name: 'submit scene feedback',
        request: () => client.submitFeedback('generation-1', { rating: 5 }),
      },
      { name: 'list owned library', request: () => client.listOwnedLibrary() },
      {
        name: 'get owned content',
        request: () => client.getOwnedLibraryContent('library-item-1'),
      },
      {
        name: 'get owned scene pack',
        request: () => client.getOwnedLibraryScenePack('library-item-1'),
      },
    ];

    for (const operation of protectedOperations) {
      await expect(operation.request(), operation.name).rejects.toThrow(AUTH_REQUIRED_MESSAGE);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
