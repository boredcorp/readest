import type { StoryBoredSceneGeneration, StoryBoredSceneStatus } from './types';

const ACTIVE_STATUSES = new Set<StoryBoredSceneStatus>(['queued', 'prompting', 'generating']);
const COMPLETED_HISTORY_LIMIT = 20;
const SIGNED_URL_REFRESH_WINDOW_MS = 30_000;

export interface StoryBoredSceneHistory {
  latestActive: StoryBoredSceneGeneration | null;
  completed: StoryBoredSceneGeneration[];
  items: StoryBoredSceneGeneration[];
}

function newestFirst(left: StoryBoredSceneGeneration, right: StoryBoredSceneGeneration): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

export function getStoryBoredSceneHistory(
  generations: StoryBoredSceneGeneration[],
  bookId: string,
): StoryBoredSceneHistory {
  const seen = new Set<string>();
  const scoped = [...generations]
    .filter((generation) => generation.bookId === bookId)
    .sort(newestFirst)
    .filter((generation) => {
      if (seen.has(generation.id)) return false;
      seen.add(generation.id);
      return true;
    });
  const latestActive = scoped.find((generation) => ACTIVE_STATUSES.has(generation.status)) ?? null;
  const completed = scoped
    .filter((generation) => generation.status === 'completed')
    .slice(0, COMPLETED_HISTORY_LIMIT);

  return {
    latestActive,
    completed,
    items: latestActive ? [latestActive, ...completed] : completed,
  };
}

export function isStoryBoredSceneImageExpired(generation: StoryBoredSceneGeneration): boolean {
  return generation.status === 'completed' && !generation.image;
}

export function isStoryBoredSceneImageUrlExpired(
  generation: StoryBoredSceneGeneration,
  now = Date.now(),
): boolean {
  if (!generation.image) return false;
  return Date.parse(generation.image.urlExpiresAt) <= now + SIGNED_URL_REFRESH_WINDOW_MS;
}
