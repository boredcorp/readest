import type {
  LearningBoredClient,
  LearningBoredClientOptions,
  LearningBoredCredits,
  LearningBoredDocumentSummary,
} from '../client';

export const LEARNINGBORED_PREVIEW_DOCUMENTS = [
  {
    id: 'preview-waterworks',
    title: 'Maps of the Imaginary Waterworks',
    author: 'Mira Vale',
    format: 'EPUB',
    sourceType: 'sample',
    readerBookId: 'preview-reader-waterworks',
    pageCount: 184,
    blueprintId: null,
    boardCount: 4,
    recallItemCount: 12,
    dueCount: 5,
    lastOpenedAt: '2026-08-06T08:15:00.000Z',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-06T08:15:00.000Z',
  },
  {
    id: 'preview-observatory',
    title:
      'خرائط الماء · 水の地図 — A Deliberately Long Field Notebook from the Fictional Brass Observatory',
    author: 'Noor Alder',
    format: 'PDF',
    sourceType: 'sample',
    readerBookId: 'preview-reader-observatory',
    pageCount: 72,
    blueprintId: null,
    boardCount: 1,
    recallItemCount: 3,
    dueCount: 0,
    lastOpenedAt: '2026-08-05T17:30:00.000Z',
    createdAt: '2026-08-02T09:00:00.000Z',
    updatedAt: '2026-08-05T17:30:00.000Z',
  },
] as const satisfies readonly LearningBoredDocumentSummary[];

export const LEARNINGBORED_PREVIEW_ACCOUNT = {
  displayName: 'Avery Rowan',
  email: 'avery.rowan@example.invalid',
  betaStatus: 'Private beta access',
  availableChalk: 8,
  reservedChalk: 1,
  lifetimeGranted: 18,
  lifetimeSpent: 9,
} as const;

export const LEARNINGBORED_PREVIEW_CREDITS = {
  availableChalk: LEARNINGBORED_PREVIEW_ACCOUNT.availableChalk,
  reservedChalk: LEARNINGBORED_PREVIEW_ACCOUNT.reservedChalk,
  lifetimeGranted: LEARNINGBORED_PREVIEW_ACCOUNT.lifetimeGranted,
  lifetimeSpent: LEARNINGBORED_PREVIEW_ACCOUNT.lifetimeSpent,
  recent: [
    {
      eventType: 'chalk_granted',
      chalkDelta: 4,
      createdAt: '2026-08-04T09:30:00.000Z',
    },
    {
      eventType: 'chalk_committed',
      chalkDelta: -1,
      createdAt: '2026-08-03T14:10:00.000Z',
    },
  ],
} as const satisfies LearningBoredCredits;

export type LearningBoredPreviewFixtureMode = 'ready' | 'loading' | 'error';

function waitUntilAborted<T>(options?: LearningBoredClientOptions): Promise<T> {
  return new Promise((_resolve, reject) => {
    const abort = () => {
      const error = new Error('The deterministic preview request was cancelled.');
      error.name = 'AbortError';
      reject(error);
    };

    if (options?.signal?.aborted) {
      abort();
      return;
    }
    options?.signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createLearningBoredPreviewClient({
  credits = 'ready',
  documents = 'ready',
}: {
  credits?: LearningBoredPreviewFixtureMode;
  documents?: LearningBoredPreviewFixtureMode;
} = {}): LearningBoredClient {
  const fixturePort = {
    getCredits: (options?: LearningBoredClientOptions) => {
      if (credits === 'loading') return waitUntilAborted<LearningBoredCredits>(options);
      if (credits === 'error') {
        return Promise.reject(new Error('Fictional Chalk service interruption.'));
      }
      return Promise.resolve(LEARNINGBORED_PREVIEW_CREDITS);
    },
    listDocuments: (options?: LearningBoredClientOptions) => {
      if (documents === 'loading') {
        return waitUntilAborted<{ documents: LearningBoredDocumentSummary[] }>(options);
      }
      if (documents === 'error') {
        return Promise.reject(new Error('Fictional library enrichment interruption.'));
      }
      return Promise.resolve({ documents: [...LEARNINGBORED_PREVIEW_DOCUMENTS] });
    },
  } satisfies Pick<LearningBoredClient, 'getCredits' | 'listDocuments'>;

  return fixturePort as LearningBoredClient;
}
