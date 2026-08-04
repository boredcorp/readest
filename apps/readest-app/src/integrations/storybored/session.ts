import type { StoryBoredPassage, StoryBoredSceneStatus } from './types';

const STORAGE_KEY = 'storybored.scene-panel-session.v2';
const LEGACY_STORAGE_KEY = 'storybored.scene-panel-session.v1';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set<StoryBoredSceneStatus>(['queued', 'prompting', 'generating']);

export interface StoryBoredSceneSession {
  version: 2;
  ownerUserId: string;
  bookId: string;
  generationId: string;
  generationStatus: StoryBoredSceneStatus;
  passage: StoryBoredPassage;
  updatedAt: number;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSession(value: unknown): StoryBoredSceneSession | null {
  if (!isObject(value)) return null;
  const passage = value['passage'];

  if (
    value['version'] !== 2 ||
    typeof value['ownerUserId'] !== 'string' ||
    value['ownerUserId'].length === 0 ||
    typeof value['bookId'] !== 'string' ||
    typeof value['generationId'] !== 'string' ||
    typeof value['generationStatus'] !== 'string' ||
    typeof value['updatedAt'] !== 'number' ||
    !isObject(passage) ||
    typeof passage['bookId'] !== 'string' ||
    passage['bookId'] !== value['bookId'] ||
    typeof passage['selectedText'] !== 'string' ||
    typeof passage['stylePreset'] !== 'string'
  ) {
    return null;
  }

  return {
    version: 2,
    ownerUserId: value['ownerUserId'],
    bookId: value['bookId'],
    generationId: value['generationId'],
    generationStatus: value['generationStatus'] as StoryBoredSceneStatus,
    passage: passage as StoryBoredPassage,
    updatedAt: value['updatedAt'],
  };
}

export function isStoryBoredSceneActive(status: StoryBoredSceneStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function writeStoryBoredSceneSession(
  session: Omit<StoryBoredSceneSession, 'version'>,
): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...session, version: 2 }));
  } catch {}
}

export function readStoryBoredSceneSession(input: {
  ownerUserId: string;
  bookId?: string;
}): StoryBoredSceneSession | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
    if (!input.ownerUserId) return null;

    const session = parseSession(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
    if (!session) return null;

    const isExpired = Date.now() - session.updatedAt > SESSION_MAX_AGE_MS;
    const isWrongOwner = session.ownerUserId !== input.ownerUserId;
    const isWrongBook = input.bookId !== undefined && session.bookId !== input.bookId;
    if (
      isExpired ||
      isWrongOwner ||
      isWrongBook ||
      !isStoryBoredSceneActive(session.generationStatus)
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function clearStoryBoredSceneSession(generationId?: string): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
    const session = parseSession(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
    if (generationId && session?.generationId !== generationId) return;
    storage.removeItem(STORAGE_KEY);
  } catch {}
}
