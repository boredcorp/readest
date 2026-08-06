import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearningBoredFetch } from '@learningbored/sdk';

const readerContext = vi.hoisted(() => ({ sideBarBookKey: 'book-key' }));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({ sideBarBookKey: readerContext.sideBarBookKey }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({
      book: {
        hash: 'book-1',
        title: 'Fictional systems lesson',
        author: 'A. Example',
        format: 'EPUB',
      },
    }),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ getView: () => null }),
}));

import { publishLearningBoredCapture } from '@/integrations/learningbored/bridge';
import LearningBoredPanelHost from '@/integrations/learningbored/LearningBoredPanelHost';
import LearningBoredSdkClientProvider from '@/integrations/learningbored/LearningBoredSdkClientProvider';
import {
  createLearningBoredSdkClient,
  type LearningBoredSdkPort,
} from '@/integrations/learningbored/sdk-client';

const SOURCE_SPAN = { sourceStart: 0, sourceEnd: 22 } as const;
const FIGURE_BYTES = Uint8Array.from([137, 80, 78, 71]);

const SPEC = {
  version: '3.0.0',
  kind: 'concept_map',
  title: 'A fictional rotor system',
  titleSourceSpan: SOURCE_SPAN,
  nodes: [
    {
      kind: 'content',
      id: 'node_undefined',
      label: 'Unexplained regulator',
      description: 'The passage names the regulator without defining it.',
      conceptIds: ['concept_regulator'],
      undefinedConceptIds: ['concept_regulator'],
      figureStatus: 'not_requested',
      provenance: 'anchored',
      sourceSpan: SOURCE_SPAN,
    },
    {
      kind: 'figure',
      id: 'node_figure',
      figureId: 'figure_123',
      label: 'Rotor arrangement',
      description: 'A depictive view of the fictional rotor inside its housing.',
      caption: 'The rotor sits inside the housing.',
      conceptIds: ['concept_rotor'],
      undefinedConceptIds: [],
      provenance: 'anchored',
      sourceSpan: SOURCE_SPAN,
      labels: [
        {
          id: 'label_rotor',
          text: 'Rotor',
          description: 'The moving part.',
          at: { x: 0.5, y: 0.5 },
          provenance: 'anchored',
          sourceSpan: SOURCE_SPAN,
        },
      ],
    },
    {
      kind: 'content',
      id: 'node_scaffold',
      label: 'Added bridge',
      description: 'A plain-language restatement added to help.',
      conceptIds: [],
      undefinedConceptIds: [],
      figureStatus: 'not_requested',
      provenance: 'scaffold',
      scaffoldFor: 'node_undefined',
      scaffoldForm: 'restatement',
      analogyLimit: null,
    },
  ],
  edges: [
    {
      id: 'edge_regulates',
      fromNodeId: 'node_undefined',
      toNodeId: 'node_figure',
      label: 'regulates',
      provenance: 'anchored',
      sourceSpan: SOURCE_SPAN,
    },
  ],
  groups: [
    {
      id: 'group_mechanism',
      label: 'Mechanism',
      nodeIds: ['node_undefined', 'node_figure'],
      provenance: 'anchored',
      sourceSpan: SOURCE_SPAN,
    },
  ],
} as const;

const FIGURE = {
  id: 'figure_123',
  nodeId: 'node_figure',
  mimeType: 'image/png',
  widthPx: 640,
  heightPx: 360,
  contentHash: '0'.repeat(64),
  description: 'A depictive view of the fictional rotor inside its housing.',
  caption: 'The rotor sits inside the housing.',
  contentPath: '/v1/boards/board_123/figures/node_figure/content',
  provenance: 'anchored',
  sourceSpan: SOURCE_SPAN,
} as const;

const BOARD = {
  id: 'board_123',
  generationId: 'generation_123',
  documentId: 'document_123',
  kind: 'concept_map',
  title: SPEC.title,
  spec: SPEC,
  specVersion: '3.0.0',
  compositionVersion: '2.0.0',
  outline: '# A fictional rotor system\n',
  cachedSvg: null,
  rendererVersion: null,
  nodeCount: 3,
  edgeCount: 1,
  scaffoldNodeCount: 1,
  figureCount: 1,
  figureFailureCount: 0,
  showScaffold: true,
  figureFailureNodeIds: [],
  figures: [FIGURE],
  recallPreview: [
    {
      id: 'recall_123',
      kind: 'short_answer',
      stem: 'What moves in the fictional system?',
      sourceSpan: SOURCE_SPAN,
    },
  ],
} as const;

const PROJECTION = {
  boardId: BOARD.id,
  options: { kind: 'concept_map', includeScaffold: true },
  spec: SPEC,
  figures: [FIGURE],
} as const;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function recordingTransport(responses: Response[]) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const transport: LearningBoredFetch = (input, init = {}) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requests.push({ url, init });
    const response = responses.shift();
    if (!response) throw new Error('No fake response remains.');
    return Promise.resolve(response);
  };
  return { requests, transport };
}

function figureResponse(): Response {
  return new Response(FIGURE_BYTES, {
    headers: {
      'content-type': 'image/png',
      'content-length': String(FIGURE_BYTES.byteLength),
    },
  });
}

function passage() {
  const selectedText = 'A fictional rotor turns inside a stationary housing.';
  return {
    bookId: 'book-1',
    selectedText,
    surroundingContext: `Before ${selectedText} after`,
    contextOffset: 7,
    location: {
      version: 1 as const,
      kind: 'cfi' as const,
      bookId: 'book-1',
      cfi: 'epubcfi(/6/2!/4/2/1:0)',
      pageIndex: 0,
    },
  };
}

describe('LearningBored SDK Reader adapter', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('mounts the real host with an SDK-backed client from the application provider', async () => {
    const createStudyGeneration = vi.fn<LearningBoredSdkPort['createStudyGeneration']>(
      async () => ({
        id: 'generation_123',
        status: 'queued' as const,
        documentId: 'document_123',
        passageId: 'passage_123',
        compositionVersion: '2.0.0',
        requestedBoardKind: null,
        selectedTextPreview: 'A fictional rotor turns inside a stationary housing.',
        chalkCost: 1,
        chalkBalanceAfterReserve: 9,
        createdAt: '2026-08-02T12:00:00.000Z',
      }),
    );
    const sdk = {
      createStudyGeneration,
      getStudyGeneration: vi.fn(),
      cancelStudyGeneration: vi.fn(),
      retryStudyGeneration: vi.fn(),
      getBoard: vi.fn(),
      rerenderBoard: vi.fn(),
      requestFigureRegeneration: vi.fn(),
      getFigureRegeneration: vi.fn(),
      submitFeedback: vi.fn(),
    } as unknown as LearningBoredSdkPort;

    render(
      <LearningBoredSdkClientProvider sdkClient={sdk}>
        <LearningBoredPanelHost />
      </LearningBoredSdkClientProvider>,
    );

    act(() => {
      publishLearningBoredCapture({ bookKey: 'book-key', passage: passage() });
    });

    await waitFor(() => expect(createStudyGeneration).toHaveBeenCalledTimes(1));
    expect(createStudyGeneration.mock.calls[0]?.[0]).toMatchObject({
      selectedText: 'A fictional rotor turns inside a stationary housing.',
      document: { bookId: 'book-1', title: 'Fictional systems lesson' },
    });
  });

  it('loads a Board through the real SDK, hydrates private bytes, and preserves the full outline', async () => {
    const transport = recordingTransport([
      jsonResponse(BOARD),
      jsonResponse(PROJECTION),
      figureResponse(),
    ]);
    const controller = new AbortController();
    const getAccessToken = vi.fn(async () => 'supabase-reader-token');
    const client = createLearningBoredSdkClient({
      apiBaseUrl: 'https://api.example.test',
      transport: transport.transport,
      getAccessToken,
    });

    const board = await client.getBoard(
      BOARD.id,
      { includeScaffold: true },
      { signal: controller.signal },
    );

    expect(board.figures[0]).toMatchObject({
      id: FIGURE.id,
      nodeId: FIGURE.nodeId,
      imageUrl: 'data:image/png;base64,iVBORw==',
      failed: false,
    });
    expect(board.titleSourceSpan).toEqual(SOURCE_SPAN);
    const figureProjection = new DOMParser().parseFromString(
      board.figures[0]?.projectionSvg ?? '',
      'image/svg+xml',
    ).documentElement;
    expect(figureProjection.tagName.toLowerCase()).toBe('svg');
    expect(figureProjection.getAttribute('data-figure-projection')).toBe(FIGURE.id);
    expect(figureProjection.getAttribute('aria-hidden')).toBe('true');
    expect(figureProjection.getAttribute('width')).toBeTruthy();
    expect(figureProjection.getAttribute('height')).toBeTruthy();
    expect(figureProjection.querySelectorAll('[data-node-id]')).toHaveLength(1);
    expect(figureProjection.querySelector('[data-callout-index="1"]')).toBeTruthy();
    expect(figureProjection.querySelector('[data-legend-for="label_rotor"]')).toBeTruthy();
    expect(
      figureProjection.querySelector('[tabindex], [role], [aria-label], [aria-labelledby]'),
    ).toBeNull();
    expect(figureProjection.querySelector('image')?.getAttribute('preserveAspectRatio')).toBe(
      'xMidYMid meet',
    );
    expect(board.outline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node_undefined',
          undefined: true,
          undefinedConceptIds: ['concept_regulator'],
        }),
        expect.objectContaining({
          id: 'node_figure',
          caption: 'The rotor sits inside the housing.',
          labels: [expect.objectContaining({ text: 'Rotor', at: { x: 0.5, y: 0.5 } })],
        }),
        expect.objectContaining({
          id: 'relationship:edge_regulates',
          kind: 'relationship',
          label: 'Unexplained regulator → Rotor arrangement',
        }),
        expect.objectContaining({
          id: 'group:group_mechanism',
          kind: 'group',
          description: 'Unexplained regulator, Rotor arrangement',
        }),
      ]),
    );
    expect(transport.requests.map((request) => request.url)).toEqual([
      'https://api.example.test/v1/boards/board_123',
      'https://api.example.test/v1/boards/board_123/rerender',
      'https://api.example.test/v1/boards/board_123/figures/node_figure/content',
    ]);
    for (const request of transport.requests) {
      expect(request.init.credentials).toBe('include');
      expect(request.init.signal).toBe(controller.signal);
      expect(new Headers(request.init.headers).get('authorization')).toBe(
        'Bearer supabase-reader-token',
      );
    }
    expect(getAccessToken).toHaveBeenCalledTimes(transport.requests.length);
  });

  it('retains one full authorized projection so scaffold toggles stay local and reversible', async () => {
    const transport = recordingTransport([
      jsonResponse(BOARD),
      jsonResponse(PROJECTION),
      figureResponse(),
    ]);
    const client = createLearningBoredSdkClient({
      apiBaseUrl: 'https://api.example.test',
      transport: transport.transport,
    });

    const board = await client.getBoard(BOARD.id, { includeScaffold: false });

    expect(board.outline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'node_scaffold', provenance: 'scaffold' }),
      ]),
    );
    expect(board.svg).toContain('data-node-id="node_scaffold"');
    expect(board.svgWithoutScaffold).not.toContain('data-node-id="node_scaffold"');
    expect(board.svgWithoutScaffold).not.toContain('data-scaffold-connector="node_scaffold"');
    expect(JSON.parse(String(transport.requests[1]?.init.body))).toEqual({
      kind: 'concept_map',
      includeScaffold: true,
    });
  });

  it('keeps figure labels and structural meaning when private hydration fails', async () => {
    const transport = recordingTransport([
      jsonResponse(BOARD),
      jsonResponse(PROJECTION),
      jsonResponse({ error: 'figure_not_found', message: 'Figure not found.' }, 404),
    ]);
    const client = createLearningBoredSdkClient({
      apiBaseUrl: 'https://api.example.test',
      transport: transport.transport,
    });

    const board = await client.getBoard(BOARD.id, { includeScaffold: true });

    expect(board.figures[0]).toMatchObject({
      imageUrl: null,
      failed: true,
      labels: [
        expect.objectContaining({
          text: 'Rotor',
          description: 'The moving part.',
          sourceSpan: SOURCE_SPAN,
        }),
      ],
    });
    expect(board.figures[0]?.projectionSvg).toContain('Illustration unavailable.');
    expect(board.figures[0]?.projectionSvg).not.toContain('<image');
    expect(board.outline.find((item) => item.id === 'node_figure')).toMatchObject({
      figureFailed: true,
      labels: [expect.objectContaining({ text: 'Rotor' })],
    });
  });

  it('maps the SDK review boundary without exposing answers in the due queue', async () => {
    const due = {
      items: [
        {
          recallItem: {
            id: 'recall_123',
            kind: 'multiple_choice' as const,
            stem: 'Which fictional component moves?',
            documentId: 'document_123',
            conceptIds: ['concept_rotor'],
            options: [
              { id: 'choice-1', text: 'The outer ring.' },
              { id: 'choice-2', text: 'The inner rotor.' },
            ],
          },
          reviewState: {
            state: 'new' as const,
            dueAt: null,
            reps: 0,
            lapses: 0,
            overdueDays: 0,
          },
          intervalPreviews: {
            again: {
              intervalSeconds: 60,
              intervalDays: 0,
              dueAt: '2026-08-02T12:01:00.000Z',
            },
            hard: {
              intervalSeconds: 600,
              intervalDays: 0,
              dueAt: '2026-08-02T12:10:00.000Z',
            },
            good: {
              intervalSeconds: 86_400,
              intervalDays: 1,
              dueAt: '2026-08-03T12:00:00.000Z',
            },
            easy: {
              intervalSeconds: 345_600,
              intervalDays: 4,
              dueAt: '2026-08-06T12:00:00.000Z',
            },
          },
          source: {
            documentTitle: 'Fictional systems lesson',
            chapter: 'Rotor basics',
            pageLabel: 'p. 3',
            passageId: 'passage_123',
          },
        },
      ],
      queue: {
        dueNow: 0,
        dueToday: 0,
        newAvailable: 1,
        reviewedToday: 0,
        dailyTarget: 20,
      },
    };
    const selectedText = 'The inner rotor turns while the fictional outer ring remains still.';
    const answer = {
      answer: 'The inner rotor turns.',
      explanation: 'The source contrasts the inner and outer components.',
      optionRationales: [
        {
          id: 'choice-1',
          text: 'The outer ring.',
          isCorrect: false,
          rationale: 'It remains still.',
        },
        {
          id: 'choice-2',
          text: 'The inner rotor.',
          isCorrect: true,
          rationale: 'It turns.',
        },
      ],
      rubric: ['Names the inner rotor.'],
      anchor: {
        documentId: 'document_123',
        title: 'Fictional systems lesson',
        readerBookId: 'book-1',
        passageId: 'passage_123',
        chapter: 'Rotor basics',
        pageLabel: 'p. 3',
        location: {
          version: 1 as const,
          kind: 'cfi' as const,
          bookId: 'book-1',
          cfi: 'epubcfi(/6/2!/4/2/1:0)',
          pageIndex: 2,
          pageLabel: 'p. 3',
        },
        sourceSpan: { sourceStart: 0, sourceEnd: selectedText.length },
        sourceText: selectedText,
        selectedText,
      },
    };
    const gradeResult = {
      clientRequestId: '00000000-0000-4000-8000-000000000006',
      recallItemId: 'recall_123',
      grade: 'good' as const,
      answer,
      reviewState: {
        state: 'learning' as const,
        stability: 1.4,
        difficulty: 5.1,
        reps: 1,
        lapses: 0,
        lastReviewedAt: '2026-08-02T12:00:00.000Z',
        dueAt: '2026-08-03T12:00:00.000Z',
        intervalSeconds: 86_400,
        intervalDays: 1,
      },
      schedulerVersion: '1.0.0',
    };
    const getNextReviewItems = vi.fn(async () => due);
    const revealReviewItem = vi.fn(async () => ({ recallItemId: 'recall_123', answer }));
    const submitReviewGrade = vi.fn(async () => gradeResult);
    const submitReviewGradeBatch = vi.fn(async () => ({
      results: [
        {
          ...gradeResult,
          status: 'applied' as const,
          inputIndex: 0,
          clampedReviewedAt: '2026-08-02T12:00:00.000Z',
          wasClamped: false,
        },
        {
          status: 'rejected' as const,
          inputIndex: 1,
          clientRequestId: '00000000-0000-4000-8000-000000000007',
          recallItemId: 'recall_missing',
          grade: 'hard' as const,
          clampedReviewedAt: '2026-08-02T12:01:00.000Z',
          wasClamped: true,
          error: {
            code: 'not_found' as const,
            message: 'The recall item was not found.',
            details: { recallItemId: 'recall_missing' },
          },
        },
      ],
    }));
    const getReviewStats = vi.fn(async () => ({
      daily: [{ date: '2026-08-02', reviews: 1 }],
      intervalBuckets: [
        {
          label: '1–6 days',
          minimumDays: 1,
          maximumDays: 6,
          reviews: 1,
          retentionRate: 1,
        },
      ],
      totalReviews: 1,
      retentionRate: 1,
      lapseRate: 0,
      currentStreak: 1,
    }));
    const submitFeedback = vi.fn(async () => undefined);
    const sdk = {
      getNextReviewItems,
      revealReviewItem,
      submitReviewGrade,
      submitReviewGradeBatch,
      getReviewStats,
      submitFeedback,
    } as unknown as LearningBoredSdkPort;
    const client = createLearningBoredSdkClient({ sdkClient: sdk });

    const next = await client.getNextReviewItems({ documentId: 'document_123', limit: 5 });
    expect(next).toEqual(due);
    expect(JSON.stringify(next)).not.toMatch(/answer|rationale|isCorrect/u);

    const revealed = await client.revealReviewItem('recall_123');
    expect(revealed.answer).toEqual(answer);
    const graded = await client.submitReviewGrade({
      clientRequestId: gradeResult.clientRequestId,
      recallItemId: 'recall_123',
      reviewOccurrence: { state: 'new', dueAt: null, reps: 0, lapses: 0 },
      grade: 'good',
    });
    expect(graded).toEqual(gradeResult);
    const batch = await client.submitReviewGradeBatch([
      {
        clientRequestId: gradeResult.clientRequestId,
        recallItemId: 'recall_123',
        reviewOccurrence: { state: 'new', dueAt: null, reps: 0, lapses: 0 },
        grade: 'good',
        reviewedAt: '2026-08-02T12:00:00.000Z',
      },
      {
        clientRequestId: '00000000-0000-4000-8000-000000000007',
        recallItemId: 'recall_missing',
        reviewOccurrence: { state: 'new', dueAt: null, reps: 0, lapses: 0 },
        grade: 'hard',
        reviewedAt: '2026-08-02T12:01:00.000Z',
      },
    ]);
    expect(batch.results).toEqual([
      {
        ...gradeResult,
        status: 'applied',
        inputIndex: 0,
        clampedReviewedAt: '2026-08-02T12:00:00.000Z',
        wasClamped: false,
      },
      {
        status: 'rejected',
        inputIndex: 1,
        clientRequestId: '00000000-0000-4000-8000-000000000007',
        recallItemId: 'recall_missing',
        grade: 'hard',
        clampedReviewedAt: '2026-08-02T12:01:00.000Z',
        wasClamped: true,
        error: {
          code: 'not_found',
          message: 'The recall item was not found.',
          details: { recallItemId: 'recall_missing' },
        },
      },
    ]);
    expect(await client.getReviewStats({ window: '7d' })).toMatchObject({
      totalReviews: 1,
      currentStreak: 1,
    });

    await client.submitFeedback({
      recallItemId: 'recall_123',
      category: 'ambiguous_question',
      suppressItem: true,
    });
    expect(submitFeedback).toHaveBeenCalledWith({
      recallItemId: 'recall_123',
      category: 'ambiguous_question',
      suppressItem: true,
    });
  });

  it('maps the Milestone 7 progress and comprehension SDK boundary', async () => {
    const document = {
      id: 'document_123',
      title: 'Fictional systems lesson',
      author: null,
      format: 'EPUB',
      sourceType: 'upload' as const,
      readerBookId: 'book-1',
      pageCount: null,
      blueprintId: 'blueprint_123',
      boardCount: 1,
      recallItemCount: 2,
      dueCount: 1,
      lastOpenedAt: null,
      createdAt: '2026-08-03T10:00:00.000Z',
      updatedAt: '2026-08-03T10:00:00.000Z',
    };
    const mastery = {
      documentId: document.id,
      concepts: [
        {
          conceptId: 'concept_123',
          name: 'Fictional signal',
          score: null,
          tier: 'new' as const,
          itemCount: 2,
          dueCount: 1,
          lastReviewedAt: null,
          boardIds: ['board_123'],
          dueItemIds: ['recall_123'],
        },
      ],
      summary: { new: 1, learning: 0, retained: 0, lapsed: 0 },
      computedAt: '2026-08-03T10:00:00.000Z',
      derivationVersion: '1.0.0' as const,
    };
    const readiness = {
      documentId: document.id,
      blueprintId: 'blueprint_123',
      overall: null,
      objectives: [
        {
          objectiveId: 'objective_123',
          code: '1.0',
          title: 'Signals',
          weighting: 1,
          readiness: null,
          status: 'not_started' as const,
          conceptCount: 1,
          startedConceptCount: 0,
          weakestConceptIds: ['concept_123'],
        },
      ],
      conceptMappings: [],
      computedAt: '2026-08-03T10:00:00.000Z',
      derivationVersion: '1.0.0' as const,
    };
    const comprehension = {
      boardId: 'board_123',
      passageId: 'passage_123',
      status: 'unanswered' as const,
      outcome: null,
      feedbackId: null,
      respondedAt: null,
    };
    const sdk = {
      listDocuments: vi.fn(async () => ({ documents: [document] })),
      getDocument: vi.fn(async () => document),
      getDocumentMastery: vi.fn(async () => mastery),
      getDocumentReadiness: vi.fn(async () => readiness),
      listBlueprints: vi.fn(async () => ({ blueprints: [] })),
      createBlueprint: vi.fn(async () => {
        throw new Error('Not used.');
      }),
      patchBlueprint: vi.fn(async () => {
        throw new Error('Not used.');
      }),
      attachBlueprint: vi.fn(async () => ({
        documentId: document.id,
        blueprintId: 'blueprint_123',
        mappedConceptCount: 1,
        unmappedConceptCount: 0,
      })),
      setManualConceptMapping: vi.fn(async () => ({
        documentId: document.id,
        conceptId: 'concept_123',
        mappings: [
          {
            objectiveId: 'objective_123',
            confidence: 1,
            isManual: true,
            mappingVersion: null,
          },
        ],
      })),
      getBoardComprehension: vi.fn(async () => comprehension),
      submitBoardComprehension: vi.fn(async () => ({
        ...comprehension,
        status: 'answered' as const,
        outcome: 'breakthrough' as const,
        feedbackId: 'feedback_123',
        respondedAt: '2026-08-03T10:01:00.000Z',
      })),
    } as unknown as LearningBoredSdkPort;
    const client = createLearningBoredSdkClient({ sdkClient: sdk });

    expect(await client.listDocuments()).toEqual({ documents: [document] });
    expect(await client.getDocument(document.id)).toEqual(document);
    expect(await client.getDocumentMastery(document.id)).toEqual(mastery);
    expect(await client.getDocumentReadiness(document.id)).toEqual(readiness);
    expect(await client.getBoardComprehension('board_123')).toEqual(comprehension);
    await client.attachBlueprint(document.id, { blueprintId: 'blueprint_123' });
    await client.setManualConceptMapping(document.id, 'concept_123', {
      objectiveIds: ['objective_123'],
    });
    await client.submitBoardComprehension('board_123', { outcome: 'breakthrough' });

    expect(sdk.attachBlueprint).toHaveBeenCalledWith(document.id, {
      blueprintId: 'blueprint_123',
    });
    expect(sdk.setManualConceptMapping).toHaveBeenCalledWith(document.id, 'concept_123', {
      objectiveIds: ['objective_123'],
    });
    expect(sdk.submitBoardComprehension).toHaveBeenCalledWith('board_123', {
      outcome: 'breakthrough',
    });
  });
});
