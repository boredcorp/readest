import { describe, expect, it } from 'vitest';

import {
  getStoryBoredSceneHistory,
  isStoryBoredSceneImageExpired,
  isStoryBoredSceneImageUrlExpired,
} from '@/integrations/storybored/history';
import type { StoryBoredSceneGeneration } from '@/integrations/storybored/types';

function generation(
  id: string,
  status: StoryBoredSceneGeneration['status'],
  createdAt: string,
  bookId = 'book-1',
): StoryBoredSceneGeneration {
  return {
    id,
    status,
    bookId,
    prompt: 'A lantern-lit path through the woods.',
    selectedTextPreview: `Passage ${id}`,
    createdAt,
    ...(status === 'completed' ? { completedAt: createdAt } : {}),
  };
}

describe('StoryBored scene history', () => {
  it('keeps the latest active generation and the newest 20 completed scenes for one book', () => {
    const completed = Array.from({ length: 23 }, (_, index) =>
      generation(
        `completed-${String(index).padStart(2, '0')}`,
        'completed',
        new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
      ),
    );
    const history = getStoryBoredSceneHistory(
      [
        generation('failed-newest', 'failed', '2026-08-03T00:00:00.000Z'),
        generation('active-older', 'queued', '2026-08-02T00:00:00.000Z'),
        ...completed.reverse(),
        generation('active-latest', 'generating', '2026-08-04T00:00:00.000Z'),
        generation('other-book', 'completed', '2026-08-05T00:00:00.000Z', 'book-2'),
      ],
      'book-1',
    );

    expect(history.latestActive?.id).toBe('active-latest');
    expect(history.completed).toHaveLength(20);
    expect(history.completed[0]?.id).toBe('completed-22');
    expect(history.completed.at(-1)?.id).toBe('completed-03');
    expect(history.items.map(({ id }) => id)).toEqual([
      'active-latest',
      ...history.completed.map(({ id }) => id),
    ]);
  });

  it('deduplicates generations without mutating the API response order', () => {
    const older = generation('duplicate', 'completed', '2026-08-01T00:00:00.000Z');
    const newer = generation('newer', 'completed', '2026-08-02T00:00:00.000Z');
    const generations = [older, newer, older];

    const history = getStoryBoredSceneHistory(generations, 'book-1');

    expect(history.completed.map(({ id }) => id)).toEqual(['newer', 'duplicate']);
    expect(generations).toEqual([older, newer, older]);
  });

  it('treats a completed generation without image metadata as expired', () => {
    const expired = generation('expired', 'completed', '2026-08-01T00:00:00.000Z');
    const pending = generation('pending', 'generating', '2026-08-01T00:00:00.000Z');

    expect(isStoryBoredSceneImageExpired(expired)).toBe(true);
    expect(isStoryBoredSceneImageExpired(pending)).toBe(false);
  });

  it('recognizes an expired signed image URL without treating the durable scene as expired', () => {
    const scene = {
      ...generation('completed', 'completed', '2026-08-01T00:00:00.000Z'),
      image: {
        id: 'image-1',
        generationId: 'completed',
        url: 'https://assets.example.test/signed.png',
        urlExpiresAt: '2026-08-01T00:05:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    } satisfies StoryBoredSceneGeneration;

    expect(isStoryBoredSceneImageExpired(scene)).toBe(false);
    expect(isStoryBoredSceneImageUrlExpired(scene, Date.parse('2026-08-01T00:05:01.000Z'))).toBe(
      true,
    );
  });
});
