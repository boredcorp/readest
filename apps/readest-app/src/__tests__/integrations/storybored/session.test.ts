import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoryBoredSceneSession,
  isStoryBoredSceneActive,
  readStoryBoredSceneSession,
  writeStoryBoredSceneSession,
} from '@/integrations/storybored/session';
import type { StoryBoredPassage } from '@/integrations/storybored/types';

const passage: StoryBoredPassage = {
  bookId: 'book-1',
  selectedText: 'A doorway opened in the wall of fog.',
  stylePreset: 'cinematic-literary',
};

describe('StoryBored scene panel session', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T10:00:00Z'));
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('restores a recent active generation for the matching book', () => {
    writeStoryBoredSceneSession({
      ownerUserId: 'account-a',
      bookId: 'book-1',
      generationId: 'generation-1',
      generationStatus: 'generating',
      passage,
      updatedAt: Date.now(),
    });

    expect(
      readStoryBoredSceneSession({ ownerUserId: 'account-a', bookId: 'book-1' }),
    ).toMatchObject({
      ownerUserId: 'account-a',
      bookId: 'book-1',
      generationId: 'generation-1',
      generationStatus: 'generating',
      passage,
    });
  });

  it('does not restore inactive, wrong-book, or stale sessions', () => {
    writeStoryBoredSceneSession({
      ownerUserId: 'account-a',
      bookId: 'book-1',
      generationId: 'generation-1',
      generationStatus: 'completed',
      passage,
      updatedAt: Date.now(),
    });
    expect(readStoryBoredSceneSession({ ownerUserId: 'account-a', bookId: 'book-1' })).toBeNull();

    writeStoryBoredSceneSession({
      ownerUserId: 'account-a',
      bookId: 'book-1',
      generationId: 'generation-2',
      generationStatus: 'queued',
      passage,
      updatedAt: Date.now(),
    });
    expect(readStoryBoredSceneSession({ ownerUserId: 'account-a', bookId: 'book-2' })).toBeNull();

    vi.setSystemTime(new Date('2026-05-02T10:00:01Z'));
    expect(readStoryBoredSceneSession({ ownerUserId: 'account-a', bookId: 'book-1' })).toBeNull();
  });

  it('does not expose a same-book session to another account', () => {
    writeStoryBoredSceneSession({
      ownerUserId: 'account-a',
      bookId: 'shared-metadata-hash',
      generationId: 'generation-account-a',
      generationStatus: 'generating',
      passage: { ...passage, bookId: 'shared-metadata-hash' },
      updatedAt: Date.now(),
    });

    expect(
      readStoryBoredSceneSession({
        ownerUserId: 'account-b',
        bookId: 'shared-metadata-hash',
      }),
    ).toBeNull();
    expect(
      readStoryBoredSceneSession({
        ownerUserId: 'account-a',
        bookId: 'shared-metadata-hash',
      })?.generationId,
    ).toBe('generation-account-a');
  });

  it('rejects and removes legacy ownerless sessions', () => {
    localStorage.setItem(
      'storybored.scene-panel-session.v1',
      JSON.stringify({
        version: 1,
        bookId: 'book-1',
        generationId: 'legacy-generation',
        generationStatus: 'generating',
        passage,
        updatedAt: Date.now(),
      }),
    );

    expect(readStoryBoredSceneSession({ ownerUserId: 'account-a', bookId: 'book-1' })).toBeNull();
    expect(localStorage.getItem('storybored.scene-panel-session.v1')).toBeNull();
  });

  it('clears only the matching generation session', () => {
    writeStoryBoredSceneSession({
      ownerUserId: 'account-a',
      bookId: 'book-1',
      generationId: 'generation-1',
      generationStatus: 'queued',
      passage,
      updatedAt: Date.now(),
    });

    clearStoryBoredSceneSession('another-generation');
    expect(
      readStoryBoredSceneSession({ ownerUserId: 'account-a', bookId: 'book-1' })?.generationId,
    ).toBe('generation-1');

    clearStoryBoredSceneSession('generation-1');
    expect(readStoryBoredSceneSession({ ownerUserId: 'account-a', bookId: 'book-1' })).toBeNull();
  });

  it('identifies active statuses', () => {
    expect(isStoryBoredSceneActive('queued')).toBe(true);
    expect(isStoryBoredSceneActive('prompting')).toBe(true);
    expect(isStoryBoredSceneActive('generating')).toBe(true);
    expect(isStoryBoredSceneActive('completed')).toBe(false);
  });
});
