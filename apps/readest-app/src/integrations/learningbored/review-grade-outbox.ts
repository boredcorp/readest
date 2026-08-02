import {
  LEARNINGBORED_REVIEW_GRADES,
  type LearningBoredDueReviewItem,
  type LearningBoredSubmitReviewGradeInput,
} from './client';

const STORAGE_KEY = 'learningbored.review-grade-outbox.v1';
const OUTBOX_VERSION = 1;
const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;

const REVIEW_STATES = new Set(['new', 'learning', 'review', 'relearning']);
const REVIEW_GRADES = new Set<string>(LEARNINGBORED_REVIEW_GRADES);

export interface LearningBoredReviewOccurrence {
  recallItemId: string;
  documentId: string;
  state: LearningBoredDueReviewItem['reviewState']['state'];
  dueAt: string | null;
  reps: number;
  lapses: number;
}

export interface LearningBoredReviewGradeOutboxEntry {
  version: 1;
  documentScope: string | null;
  occurrence: LearningBoredReviewOccurrence;
  request: LearningBoredSubmitReviewGradeInput;
  createdAt: number;
  expiresAt: number;
}

export type LearningBoredReviewGradeOutboxReadResult =
  | { status: 'empty' }
  | { status: 'available'; entry: LearningBoredReviewGradeOutboxEntry }
  | { status: 'unavailable' };

export type LearningBoredReviewGradeOutboxWriteResult =
  | { status: 'stored' }
  | { status: 'conflict'; entry: LearningBoredReviewGradeOutboxEntry }
  | { status: 'unavailable' };

export type LearningBoredReviewGradeOutboxClearResult =
  | { status: 'cleared' }
  | { status: 'conflict'; entry: LearningBoredReviewGradeOutboxEntry }
  | { status: 'unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isResourceId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128;
}

function isClientRequestId(value: unknown): value is string {
  return (
    isResourceId(value) &&
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e;
    })
  );
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function parseRequestOccurrence(
  value: unknown,
): LearningBoredSubmitReviewGradeInput['reviewOccurrence'] | null {
  if (!isRecord(value)) return null;
  const state = value['state'];
  const dueAt = value['dueAt'];
  const reps = value['reps'];
  const lapses = value['lapses'];
  if (
    !hasOnlyKeys(value, ['state', 'dueAt', 'reps', 'lapses']) ||
    typeof state !== 'string' ||
    !REVIEW_STATES.has(state) ||
    (dueAt !== null && !isIsoDateTime(dueAt)) ||
    !isNonnegativeInteger(reps) ||
    !isNonnegativeInteger(lapses) ||
    (state === 'new' && (dueAt !== null || reps !== 0 || lapses !== 0)) ||
    (state !== 'new' && dueAt === null)
  ) {
    return null;
  }

  return {
    state: state as LearningBoredSubmitReviewGradeInput['reviewOccurrence']['state'],
    dueAt,
    reps,
    lapses,
  };
}

function parseRequest(value: unknown): LearningBoredSubmitReviewGradeInput | null {
  if (!isRecord(value)) return null;
  const clientRequestId = value['clientRequestId'];
  const recallItemId = value['recallItemId'];
  const reviewOccurrence = parseRequestOccurrence(value['reviewOccurrence']);
  const grade = value['grade'];
  const elapsedMs = value['elapsedMs'];
  const answeredOptionId = value['answeredOptionId'];
  if (
    !hasOnlyKeys(value, [
      'clientRequestId',
      'recallItemId',
      'reviewOccurrence',
      'grade',
      'elapsedMs',
      'answeredOptionId',
    ]) ||
    !isClientRequestId(clientRequestId) ||
    !isResourceId(recallItemId) ||
    !reviewOccurrence ||
    typeof grade !== 'string' ||
    !REVIEW_GRADES.has(grade) ||
    (elapsedMs !== undefined && (!isNonnegativeInteger(elapsedMs) || elapsedMs > 86_400_000)) ||
    (answeredOptionId !== undefined && !isResourceId(answeredOptionId))
  ) {
    return null;
  }

  return {
    clientRequestId,
    recallItemId,
    reviewOccurrence,
    grade: grade as LearningBoredSubmitReviewGradeInput['grade'],
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
    ...(answeredOptionId === undefined ? {} : { answeredOptionId }),
  };
}

function parseOccurrence(value: unknown): LearningBoredReviewOccurrence | null {
  if (!isRecord(value)) return null;
  const recallItemId = value['recallItemId'];
  const documentId = value['documentId'];
  const state = value['state'];
  const dueAt = value['dueAt'];
  const reps = value['reps'];
  const lapses = value['lapses'];
  if (
    !hasOnlyKeys(value, ['recallItemId', 'documentId', 'state', 'dueAt', 'reps', 'lapses']) ||
    !isResourceId(recallItemId) ||
    !isResourceId(documentId) ||
    typeof state !== 'string' ||
    !REVIEW_STATES.has(state) ||
    (dueAt !== null && !isIsoDateTime(dueAt)) ||
    !isNonnegativeInteger(reps) ||
    !isNonnegativeInteger(lapses)
  ) {
    return null;
  }

  return {
    recallItemId,
    documentId,
    state: state as LearningBoredReviewOccurrence['state'],
    dueAt,
    reps,
    lapses,
  };
}

function parseEntry(value: unknown, now: number): LearningBoredReviewGradeOutboxEntry | null {
  if (!isRecord(value)) return null;
  const version = value['version'];
  const documentScope = value['documentScope'];
  const createdAt = value['createdAt'];
  const expiresAt = value['expiresAt'];
  if (
    !hasOnlyKeys(value, [
      'version',
      'documentScope',
      'occurrence',
      'request',
      'createdAt',
      'expiresAt',
    ]) ||
    version !== OUTBOX_VERSION ||
    (documentScope !== null && !isResourceId(documentScope)) ||
    !isNonnegativeInteger(createdAt) ||
    !isNonnegativeInteger(expiresAt) ||
    createdAt > now + MAX_FUTURE_CLOCK_SKEW_MS ||
    expiresAt <= createdAt ||
    expiresAt - createdAt > OUTBOX_TTL_MS
  ) {
    return null;
  }

  const occurrence = parseOccurrence(value['occurrence']);
  const request = parseRequest(value['request']);
  if (
    !occurrence ||
    !request ||
    request.recallItemId !== occurrence.recallItemId ||
    request.reviewOccurrence.state !== occurrence.state ||
    request.reviewOccurrence.dueAt !== occurrence.dueAt ||
    request.reviewOccurrence.reps !== occurrence.reps ||
    request.reviewOccurrence.lapses !== occurrence.lapses ||
    (documentScope !== null && documentScope !== occurrence.documentId)
  ) {
    return null;
  }

  return {
    version: OUTBOX_VERSION,
    documentScope,
    occurrence,
    request: {
      ...request,
      reviewOccurrence: { ...request.reviewOccurrence },
    },
    createdAt,
    expiresAt,
  };
}

function getStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function removeAndVerify(storage: Storage): boolean {
  try {
    storage.removeItem(STORAGE_KEY);
    return storage.getItem(STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

export function createLearningBoredReviewGradeOutboxEntry(
  item: LearningBoredDueReviewItem,
  documentScope: string | undefined,
  request: LearningBoredSubmitReviewGradeInput,
  now = Date.now(),
): LearningBoredReviewGradeOutboxEntry {
  return {
    version: OUTBOX_VERSION,
    documentScope: documentScope ?? null,
    occurrence: {
      recallItemId: item.recallItem.id,
      documentId: item.recallItem.documentId,
      state: item.reviewState.state,
      dueAt: item.reviewState.dueAt,
      reps: item.reviewState.reps,
      lapses: item.reviewState.lapses,
    },
    request,
    createdAt: now,
    expiresAt: now + OUTBOX_TTL_MS,
  };
}

export function readLearningBoredReviewGradeOutbox(
  now = Date.now(),
): LearningBoredReviewGradeOutboxReadResult {
  const storage = getStorage();
  if (!storage) return { status: 'unavailable' };

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return removeAndVerify(storage) ? { status: 'empty' } : { status: 'unavailable' };
  }

  const entry = parseEntry(parsed, now);
  if (!entry || entry.expiresAt <= now) {
    return removeAndVerify(storage) ? { status: 'empty' } : { status: 'unavailable' };
  }
  return { status: 'available', entry };
}

export function writeLearningBoredReviewGradeOutbox(
  entry: LearningBoredReviewGradeOutboxEntry,
  now = Date.now(),
): LearningBoredReviewGradeOutboxWriteResult {
  const validatedEntry = parseEntry(entry, now);
  if (!validatedEntry || validatedEntry.expiresAt <= now) {
    return { status: 'unavailable' };
  }

  const existing = readLearningBoredReviewGradeOutbox(now);
  if (existing.status === 'unavailable') return existing;
  if (existing.status === 'available') {
    if (existing.entry.request.clientRequestId !== validatedEntry.request.clientRequestId) {
      return { status: 'conflict', entry: existing.entry };
    }
    return JSON.stringify(existing.entry) === JSON.stringify(validatedEntry)
      ? { status: 'stored' }
      : { status: 'conflict', entry: existing.entry };
  }

  const storage = getStorage();
  if (!storage) return { status: 'unavailable' };
  const serialized = JSON.stringify(validatedEntry);
  try {
    storage.setItem(STORAGE_KEY, serialized);
    return storage.getItem(STORAGE_KEY) === serialized
      ? { status: 'stored' }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export function clearLearningBoredReviewGradeOutbox(
  clientRequestId: string,
  now = Date.now(),
): LearningBoredReviewGradeOutboxClearResult {
  const existing = readLearningBoredReviewGradeOutbox(now);
  if (existing.status === 'unavailable') return existing;
  if (existing.status === 'empty') return { status: 'cleared' };
  if (existing.entry.request.clientRequestId !== clientRequestId) {
    return { status: 'conflict', entry: existing.entry };
  }

  const storage = getStorage();
  return storage && removeAndVerify(storage) ? { status: 'cleared' } : { status: 'unavailable' };
}
