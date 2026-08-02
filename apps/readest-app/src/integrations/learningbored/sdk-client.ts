import {
  LearningBoredClient as SdkLearningBoredClient,
  type AccessTokenProvider,
  type LearningBoredFetch,
} from '@learningbored/sdk';

import type {
  LearningBoredBoardFigure,
  LearningBoredBoardOutlineItem,
  LearningBoredBoardResult,
  LearningBoredBatchReviewGradeResult,
  LearningBoredClient,
  LearningBoredClientOptions,
  LearningBoredDueReviewItem,
  LearningBoredFigureRegenerationSnapshot,
  LearningBoredReviewAnswer,
  LearningBoredReviewNextResult,
  LearningBoredReviewStats,
  LearningBoredSourceSpan,
  LearningBoredSubmitReviewGradeResult,
} from './client';

export type LearningBoredSdkPort = Pick<
  SdkLearningBoredClient,
  | 'createStudyGeneration'
  | 'getStudyGeneration'
  | 'cancelStudyGeneration'
  | 'retryStudyGeneration'
  | 'getBoard'
  | 'rerenderBoard'
  | 'requestFigureRegeneration'
  | 'getFigureRegeneration'
  | 'getNextReviewItems'
  | 'revealReviewItem'
  | 'submitReviewGrade'
  | 'submitReviewGradeBatch'
  | 'getReviewStats'
  | 'submitFeedback'
>;

type SdkBoard = Awaited<ReturnType<LearningBoredSdkPort['getBoard']>>;
type SdkRenderedBoard = Awaited<ReturnType<LearningBoredSdkPort['rerenderBoard']>>;

export interface CreateLearningBoredSdkClientOptions {
  /** Fully configured SDK instance, primarily for an application shell or a test. */
  sdkClient?: LearningBoredSdkPort;
  /** API origin with or without the `/v1` prefix. Required when sdkClient is absent. */
  apiBaseUrl?: string;
  /** Browser/native transport injected into the SDK. */
  transport?: LearningBoredFetch;
  /** Optional Clerk bearer token provider; cookie sessions work without one. */
  getAccessToken?: AccessTokenProvider;
}

function apiV1BaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/u, '');
  if (normalized.length === 0) throw new TypeError('LearningBored API base URL is required.');
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

function abortError(): Error {
  const error = new Error('The LearningBored request was aborted.');
  error.name = 'AbortError';
  return error;
}

async function withAbort<T>(
  operation: () => Promise<T>,
  options?: LearningBoredClientOptions,
): Promise<T> {
  const signal = options?.signal;
  if (signal?.aborted) throw abortError();
  if (!signal) return operation();

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    operation()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function optionalSourceSpan(span: LearningBoredSourceSpan | null | undefined): {
  sourceSpan?: LearningBoredSourceSpan;
} {
  return span ? { sourceSpan: span } : {};
}

function hydratedFigureUrls(svg: string): Map<string, string> {
  const urls = new Map<string, string>();
  if (typeof DOMParser === 'undefined') return urls;

  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (document.querySelector('parsererror')) return urls;

  for (const image of document.querySelectorAll('image[data-figure-id]')) {
    const figureId = image.getAttribute('data-figure-id');
    const href = image.getAttribute('href');
    if (figureId && href && /^data:image\/(?:png|webp);base64,[a-z\d+/]+=*$/iu.test(href)) {
      urls.set(figureId, href);
    }
  }
  return urls;
}

function mapOutline(board: SdkBoard, rendered: SdkRenderedBoard): LearningBoredBoardOutlineItem[] {
  const nodes: LearningBoredBoardOutlineItem[] = rendered.outline.nodes.map((node) => {
    const specNode = board.spec.nodes.find((candidate) => candidate.id === node.id);
    const labels =
      node.kind === 'figure' && specNode?.kind === 'figure'
        ? specNode.labels.map((label) => ({
            id: label.id,
            text: label.text,
            description: label.description,
            at: label.at,
            provenance: label.provenance,
            ...optionalSourceSpan(label.sourceSpan ?? undefined),
          }))
        : [];

    return {
      id: node.id,
      kind: node.kind,
      label: node.label,
      description: node.description,
      provenance: node.provenance,
      ...optionalSourceSpan(node.sourceSpan ?? undefined),
      ...(node.scaffoldForm === null ? {} : { scaffoldForm: node.scaffoldForm }),
      ...(node.analogyLimit === null ? {} : { analogyLimit: node.analogyLimit }),
      undefined: node.undefined,
      undefinedConceptIds: [...node.undefinedConceptIds],
      figureFailed: node.figureFailed,
      ...(labels.length > 0 ? { labels } : {}),
    };
  });
  const relationships: LearningBoredBoardOutlineItem[] = rendered.outline.relationships.map(
    (relationship) => ({
      id: `relationship:${relationship.id}`,
      kind: 'relationship',
      label: `${relationship.fromLabel} → ${relationship.toLabel}`,
      description: relationship.label || 'These passage concepts are connected.',
      provenance: 'anchored',
      sourceSpan: relationship.sourceSpan,
    }),
  );
  const groups: LearningBoredBoardOutlineItem[] = rendered.outline.groups.map((group) => ({
    id: `group:${group.id}`,
    kind: 'group',
    label: group.label,
    description: group.nodeLabels.join(', '),
    provenance: 'anchored',
    sourceSpan: group.sourceSpan,
  }));

  return [...nodes, ...relationships, ...groups];
}

function mapFigures(board: SdkBoard, rendered: SdkRenderedBoard): LearningBoredBoardFigure[] {
  const hydratedUrls = hydratedFigureUrls(rendered.svg);
  const missingFigures = new Set(rendered.missingFigureIds);
  const failedNodes = new Set(board.figureFailureNodeIds);
  const visibleNodeIds = new Set(rendered.outline.nodes.map((node) => node.id));

  return board.figures.flatMap((figure) => {
    if (!visibleNodeIds.has(figure.nodeId)) return [];
    const node = board.spec.nodes.find((candidate) => candidate.id === figure.nodeId);
    if (!node || node.kind !== 'figure') return [];

    return [
      {
        id: figure.id,
        nodeId: figure.nodeId,
        description: figure.description,
        caption: figure.caption,
        imageUrl: hydratedUrls.get(figure.id) ?? null,
        provenance: figure.provenance,
        ...('sourceSpan' in figure ? { sourceSpan: figure.sourceSpan } : {}),
        labels: node.labels.map((label) => ({
          id: label.id,
          text: label.text,
          description: label.description,
          at: label.at,
          provenance: label.provenance,
          ...optionalSourceSpan(label.sourceSpan ?? undefined),
        })),
        failed: missingFigures.has(figure.id) || failedNodes.has(figure.nodeId),
      },
    ];
  });
}

function mapBoard(board: SdkBoard, rendered: SdkRenderedBoard): LearningBoredBoardResult {
  return {
    id: board.id,
    documentId: board.documentId,
    kind: rendered.effectiveKind,
    title: board.title,
    svg: rendered.svg,
    outline: mapOutline(board, rendered),
    figures: mapFigures(board, rendered),
    recallQuestions: board.recallPreview.map((item) => ({
      id: item.id,
      kind: item.kind,
      question: item.stem,
    })),
  };
}

function mapDueReviewItem(
  item: Awaited<ReturnType<LearningBoredSdkPort['getNextReviewItems']>>['items'][number],
): LearningBoredDueReviewItem {
  return {
    recallItem: {
      id: item.recallItem.id,
      kind: item.recallItem.kind,
      stem: item.recallItem.stem,
      documentId: item.recallItem.documentId,
      conceptIds: [...item.recallItem.conceptIds],
      ...('options' in item.recallItem
        ? { options: item.recallItem.options.map((option) => ({ ...option })) }
        : {}),
    },
    reviewState: { ...item.reviewState },
    intervalPreviews: {
      again: { ...item.intervalPreviews.again },
      hard: { ...item.intervalPreviews.hard },
      good: { ...item.intervalPreviews.good },
      easy: { ...item.intervalPreviews.easy },
    },
    source: { ...item.source },
  };
}

function mapReviewAnswer(
  answer: Awaited<ReturnType<LearningBoredSdkPort['revealReviewItem']>>['answer'],
): LearningBoredReviewAnswer {
  return {
    answer: answer.answer,
    explanation: answer.explanation,
    optionRationales: answer.optionRationales.map((option) => ({ ...option })),
    ...(answer.rubric === undefined ? {} : { rubric: [...answer.rubric] }),
    anchor: {
      ...answer.anchor,
      location: { ...answer.anchor.location },
      sourceSpan: { ...answer.anchor.sourceSpan },
    },
  };
}

function mapGradeResult(
  result: Awaited<ReturnType<LearningBoredSdkPort['submitReviewGrade']>>,
): LearningBoredSubmitReviewGradeResult {
  return {
    clientRequestId: result.clientRequestId,
    recallItemId: result.recallItemId,
    grade: result.grade,
    answer: mapReviewAnswer(result.answer),
    reviewState: { ...result.reviewState },
    schedulerVersion: result.schedulerVersion,
  };
}

function mapBatchGradeResult(
  result: Awaited<ReturnType<LearningBoredSdkPort['submitReviewGradeBatch']>>['results'][number],
): LearningBoredBatchReviewGradeResult {
  if (result.status === 'rejected') {
    return {
      status: 'rejected',
      inputIndex: result.inputIndex,
      clientRequestId: result.clientRequestId,
      recallItemId: result.recallItemId,
      grade: result.grade,
      clampedReviewedAt: result.clampedReviewedAt,
      wasClamped: result.wasClamped,
      error: {
        code: result.error.code,
        message: result.error.message,
        ...(result.error.details === undefined ? {} : { details: { ...result.error.details } }),
      },
    };
  }

  return {
    ...mapGradeResult(result),
    status: 'applied',
    inputIndex: result.inputIndex,
    clampedReviewedAt: result.clampedReviewedAt,
    wasClamped: result.wasClamped,
  };
}

function mapReviewStats(
  stats: Awaited<ReturnType<LearningBoredSdkPort['getReviewStats']>>,
): LearningBoredReviewStats {
  return {
    daily: stats.daily.map((day) => ({ ...day })),
    intervalBuckets: stats.intervalBuckets.map((bucket) => ({ ...bucket })),
    totalReviews: stats.totalReviews,
    retentionRate: stats.retentionRate,
    lapseRate: stats.lapseRate,
    currentStreak: stats.currentStreak,
  };
}

function createSdk(
  options: CreateLearningBoredSdkClientOptions,
  signal?: AbortSignal,
): LearningBoredSdkPort {
  if (options.sdkClient) return options.sdkClient;
  if (!options.transport) throw new TypeError('LearningBored SDK transport is required.');

  const transport: LearningBoredFetch = signal
    ? (input, init) => options.transport!(input, { ...init, signal })
    : options.transport;

  return new SdkLearningBoredClient({
    baseUrl: apiV1BaseUrl(options.apiBaseUrl ?? ''),
    fetch: transport,
    ...(options.getAccessToken ? { getAccessToken: options.getAccessToken } : {}),
  });
}

/**
 * Adapts the versioned root SDK to the small Reader-owned port. All requests,
 * response validation, credentials, and private figure loading stay inside the SDK.
 */
export function createLearningBoredSdkClient(
  options: CreateLearningBoredSdkClientOptions,
): LearningBoredClient {
  const loadRenderedBoard = async (
    boardId: string,
    input: { kind?: LearningBoredBoardResult['kind']; includeScaffold: boolean },
    requestOptions?: LearningBoredClientOptions,
  ): Promise<LearningBoredBoardResult> => {
    const sdk = createSdk(options, requestOptions?.signal);
    const board = await withAbort(() => sdk.getBoard(boardId), requestOptions);
    const rendered = await withAbort(
      () =>
        sdk.rerenderBoard(boardId, {
          kind: input.kind ?? board.kind,
          includeScaffold: input.includeScaffold,
        }),
      requestOptions,
    );
    return mapBoard(board, rendered);
  };

  return {
    async createGeneration(input, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const created = await withAbort(() => sdk.createStudyGeneration(input), requestOptions);
      return { id: created.id, status: created.status };
    },

    async getGeneration(generationId, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const generation = await withAbort(
        () => sdk.getStudyGeneration(generationId),
        requestOptions,
      );
      return {
        id: generation.id,
        status: generation.status,
        boardId: generation.boardId,
        failureReason: generation.failureReason,
      };
    },

    getBoard(boardId, input, requestOptions) {
      return loadRenderedBoard(boardId, input, requestOptions);
    },

    rerenderBoard(boardId, input, requestOptions) {
      return loadRenderedBoard(boardId, input, requestOptions);
    },

    async cancelGeneration(generationId, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const generation = await withAbort(
        () => sdk.cancelStudyGeneration(generationId),
        requestOptions,
      );
      return {
        id: generation.id,
        status: generation.status,
        boardId: generation.boardId,
        failureReason: generation.failureReason,
      };
    },

    async retryGeneration(generationId, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const created = await withAbort(() => sdk.retryStudyGeneration(generationId), requestOptions);
      return { id: created.id, status: created.status };
    },

    async getNextReviewItems(input = {}, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const review = await withAbort(() => sdk.getNextReviewItems(input), requestOptions);
      return {
        items: review.items.map(mapDueReviewItem),
        queue: { ...review.queue },
      } satisfies LearningBoredReviewNextResult;
    },

    async revealReviewItem(recallItemId, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const revealed = await withAbort(() => sdk.revealReviewItem(recallItemId), requestOptions);
      return {
        recallItemId: revealed.recallItemId,
        answer: mapReviewAnswer(revealed.answer),
      };
    },

    async submitReviewGrade(input, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const result = await withAbort(() => sdk.submitReviewGrade(input), requestOptions);
      return mapGradeResult(result);
    },

    async submitReviewGradeBatch(grades, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const result = await withAbort(() => sdk.submitReviewGradeBatch(grades), requestOptions);
      return { results: result.results.map(mapBatchGradeResult) };
    },

    async getReviewStats(input = {}, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const stats = await withAbort(() => sdk.getReviewStats(input), requestOptions);
      return mapReviewStats(stats);
    },

    async requestFigureRegeneration(boardId, nodeId, input, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const regeneration = await withAbort(
        () => sdk.requestFigureRegeneration(boardId, nodeId, input),
        requestOptions,
      );
      return mapFigureRegeneration(regeneration);
    },

    async getFigureRegeneration(regenerationId, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      const regeneration = await withAbort(
        () => sdk.getFigureRegeneration(regenerationId),
        requestOptions,
      );
      return mapFigureRegeneration(regeneration);
    },

    async submitFeedback(input, requestOptions) {
      const sdk = createSdk(options, requestOptions?.signal);
      await withAbort(() => sdk.submitFeedback(input), requestOptions);
    },
  } satisfies LearningBoredClient;
}

function mapFigureRegeneration(
  regeneration: Awaited<ReturnType<LearningBoredSdkPort['getFigureRegeneration']>>,
): LearningBoredFigureRegenerationSnapshot {
  return {
    id: regeneration.id,
    boardId: regeneration.boardId,
    nodeId: regeneration.nodeId,
    clientRequestId: regeneration.clientRequestId,
    issue: regeneration.issue,
    status: regeneration.status,
    chalkCost: regeneration.chalkCost,
    failureReason: regeneration.failureReason,
    refundConfirmed: regeneration.refundConfirmed,
  };
}
