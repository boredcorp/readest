import type {
  LearningBoredBlueprint,
  LearningBoredBoardComprehension,
  LearningBoredBoardResult,
  LearningBoredClient,
  LearningBoredDocumentSummary,
  LearningBoredFigureRegenerationSnapshot,
  LearningBoredMasteryResult,
  LearningBoredReadinessResult,
} from '../client';
import type { LearningBoredCapturedPassage } from '../types';
import type { LearningBoredPreviewTheme } from './contract';

export const LEARNINGBORED_PREVIEW_PASSAGE_TEXT =
  'Water enters a fictional settling chamber. A calming zone slows the flow, so denser particles sink while clarified water leaves through an upper outlet.';

const contextPrefix = 'The training note says: ';
const contextSuffix = ' The chamber is generic and unbranded.';

export const LEARNINGBORED_PREVIEW_PASSAGE: LearningBoredCapturedPassage = {
  bookId: 'preview-reader-waterworks',
  selectedText: LEARNINGBORED_PREVIEW_PASSAGE_TEXT,
  surroundingContext: `${contextPrefix}${LEARNINGBORED_PREVIEW_PASSAGE_TEXT}${contextSuffix}`,
  contextOffset: contextPrefix.length,
  chapter: 'A fictional waterworks lesson',
  location: {
    version: 1,
    kind: 'cfi',
    bookId: 'preview-reader-waterworks',
    cfi: 'epubcfi(/6/4!/4/2/2:0)',
    pageIndex: 6,
    sectionHref: 'chapter-2.xhtml',
    pageLabel: '17',
  },
};

const settlingChamberImage = encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 360">
    <rect width="720" height="360" fill="#e7e5df"/>
    <path d="M80 90H640V275H80Z" fill="#f8f7f2" stroke="#7c8583" stroke-width="8"/>
    <path d="M88 150C220 120 320 184 440 150C520 128 580 134 632 148V267H88Z" fill="#cfdedd"/>
    <path d="M8 138H165" fill="none" stroke="#667976" stroke-width="24"/>
    <path d="M550 115H712" fill="none" stroke="#667976" stroke-width="18"/>
    <path d="M235 185L270 262M315 178L338 263M402 186L425 263" stroke="#806f55" stroke-width="12" stroke-linecap="round"/>
    <path d="M175 144C225 185 282 202 352 190C422 178 480 139 547 129" fill="none" stroke="#587a76" stroke-width="7" stroke-dasharray="14 12"/>
  </svg>
`);

export const LEARNINGBORED_PREVIEW_FIGURE_PROJECTION = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure-projection="preview-figure-settling-chamber" focusable="false" viewBox="0 0 760 520" width="760" height="520"><g data-node-id="preview-node-figure"><rect fill="var(--lb-board-figure-surface)" height="520" width="760"/><image data-figure-id="preview-figure-settling-chamber" href="data:image/svg+xml,${settlingChamberImage}" preserveAspectRatio="xMidYMid meet" x="20" y="20" width="720" height="360"/><g data-callout-index="1"><circle cx="120" cy="155" fill="var(--lb-board-figure-label-plate)" r="17" stroke="var(--lb-board-figure-marker)" stroke-width="2"/><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="18" font-weight="700" text-anchor="middle" x="120" y="161">1</text></g><g data-callout-index="2"><circle cx="380" cy="258" fill="var(--lb-board-figure-label-plate)" r="17" stroke="var(--lb-board-figure-marker)" stroke-width="2"/><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="18" font-weight="700" text-anchor="middle" x="380" y="264">2</text></g><g data-callout-index="3"><circle cx="650" cy="130" fill="var(--lb-board-figure-label-plate)" r="17" stroke="var(--lb-board-figure-marker)" stroke-width="2"/><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="18" font-weight="700" text-anchor="middle" x="650" y="136">3</text></g><g data-legend-for="preview-label-inlet"><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="17" x="32" y="420"><tspan font-weight="700">1 Inlet</tspan><tspan dx="8">— water enters the chamber.</tspan></text></g><g data-legend-for="preview-label-settling"><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="17" x="32" y="454"><tspan font-weight="700">2 Settling region</tspan><tspan dx="8">— denser particles move downward.</tspan></text></g><g data-legend-for="preview-label-outlet"><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="17" x="32" y="488"><tspan font-weight="700">3 Upper outlet</tspan><tspan dx="8">— clarified water leaves.</tspan></text></g></g></svg>`;

const upperOutletProjection = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure-projection="preview-figure-upper-outlet" focusable="false" viewBox="0 0 640 400" width="640" height="400"><rect fill="var(--lb-board-figure-surface)" height="400" width="640"/><path d="M84 290V86H492V154H572" fill="none" stroke="var(--lb-board-figure-leader)" stroke-width="18"/><path d="M488 154H592" fill="none" stroke="var(--lb-board-anchor)" stroke-width="8"/><circle cx="488" cy="154" fill="var(--lb-board-figure-label-plate)" r="22" stroke="var(--lb-board-figure-marker)" stroke-width="3"/><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="18" font-weight="700" text-anchor="middle" x="488" y="161">1</text><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="19" font-weight="700" x="44" y="342">1 Upper outlet — clarified water leaves above the settling region.</text></svg>`;

export const LEARNINGBORED_PREVIEW_SECOND_FIGURE: LearningBoredBoardResult['figures'][number] = {
  id: 'preview-figure-upper-outlet',
  nodeId: 'preview-node-figure',
  description: 'A generic detail view places the upper outlet above the chamber settling region.',
  caption: 'Illustrative, generic upper-outlet detail.',
  imageUrl: 'fixture-private://preview-figure-upper-outlet',
  provenance: 'anchored',
  sourceSpan: { sourceStart: 74, sourceEnd: LEARNINGBORED_PREVIEW_PASSAGE_TEXT.length },
  labels: [
    {
      id: 'preview-label-upper-outlet-detail',
      text: 'Upper outlet',
      description: 'Clarified water leaves above the settling region.',
      at: { x: 0.76, y: 0.38 },
      provenance: 'anchored',
      sourceSpan: { sourceStart: 106, sourceEnd: LEARNINGBORED_PREVIEW_PASSAGE_TEXT.length },
    },
  ],
  projectionSvg: upperOutletProjection,
  failed: false,
};

const canonicalBoardSvg = `<svg xmlns="http://www.w3.org/2000/svg" aria-labelledby="preview-board-title preview-board-description" data-board-theme-source="miura-deployment-light-v1" role="img" viewBox="0 0 920 680" width="920" height="680"><title id="preview-board-title">How the fictional settling chamber separates particles</title><desc id="preview-board-description">A process Board with an inlet, calming zone, settling Figure, and upper outlet. Its complete text outline follows the visual.</desc><rect fill="var(--lb-board-canvas)" height="680" width="920"/><g aria-label="Water enters" data-source-start="0" data-source-end="42" tabindex="0"><rect fill="var(--lb-board-node-surface)" height="108" rx="10" stroke="var(--lb-board-node-border)" x="52" y="58" width="240"/><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="24" font-weight="700" x="76" y="108">Water enters</text><text fill="var(--lb-board-secondary-ink)" font-family="var(--lb-board-font-family)" font-size="17" x="76" y="139">through the inlet</text></g><path d="M292 112H366" fill="none" marker-end="url(#preview-arrow)" stroke="var(--lb-board-secondary-ink)" stroke-width="3"/><defs><marker id="preview-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4"><path d="M0 0L8 4L0 8Z" fill="var(--lb-board-secondary-ink)"/></marker></defs><g aria-label="Calming zone" data-source-start="43" data-source-end="73" tabindex="0"><rect fill="var(--lb-board-node-surface)" height="108" rx="10" stroke="var(--lb-board-anchor)" x="366" y="58" width="240"/><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="24" font-weight="700" x="390" y="108">Calming zone</text><text fill="var(--lb-board-secondary-ink)" font-family="var(--lb-board-font-family)" font-size="17" x="390" y="139">slows the flow</text></g><path d="M606 112H680" fill="none" marker-end="url(#preview-arrow)" stroke="var(--lb-board-secondary-ink)" stroke-width="3"/><g aria-label="Clarified water leaves" data-source-start="106" data-source-end="151" tabindex="0"><rect fill="var(--lb-board-node-surface)" height="108" rx="10" stroke="var(--lb-board-node-border)" x="680" y="58" width="190"/><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="21" font-weight="700" x="704" y="103">Clarified water</text><text fill="var(--lb-board-secondary-ink)" font-family="var(--lb-board-font-family)" font-size="17" x="704" y="137">leaves above</text></g><g aria-label="Settling chamber Figure" data-source-start="0" data-source-end="151" tabindex="0"><rect fill="var(--lb-board-figure-surface)" height="330" rx="10" stroke="var(--lb-board-node-border)" x="52" y="214" width="818"/><image data-figure-id="preview-figure-settling-chamber" href="data:image/svg+xml,${settlingChamberImage}" preserveAspectRatio="xMidYMid meet" x="76" y="238" width="770" height="244"/><text fill="var(--lb-board-secondary-ink)" font-family="var(--lb-board-font-family)" font-size="17" x="76" y="518">Illustrative, generic settling chamber</text></g><g data-provenance="scaffold"><rect fill="var(--lb-board-scaffold-surface)" height="76" rx="10" stroke="var(--lb-board-scaffold-border)" stroke-dasharray="8 6" x="196" y="574" width="528"/><text fill="var(--lb-board-ink)" font-family="var(--lb-board-font-family)" font-size="18" font-weight="700" x="220" y="607">Added to help · restatement</text><text fill="var(--lb-board-secondary-ink)" font-family="var(--lb-board-font-family)" font-size="16" x="220" y="632">Slower water gives denser particles time to sink.</text></g></svg>`;

const previewThemeIds: Record<LearningBoredPreviewTheme, string> = {
  light: 'miura-deployment-light-v1',
  dark: 'miura-deployment-dark-v1',
  eink: 'miura-deployment-eink-v1',
};

export function getLearningBoredPreviewBoard(
  theme: LearningBoredPreviewTheme,
): LearningBoredBoardResult {
  const themeId = previewThemeIds[theme];
  const svg = canonicalBoardSvg.replace(
    'data-board-theme-source="miura-deployment-light-v1"',
    `data-board-theme-source="${themeId}"`,
  );
  return {
    ...LEARNINGBORED_PREVIEW_BOARD,
    svg,
    svgWithoutScaffold: svg.replace(
      /<g data-provenance="scaffold">[\s\S]*?<\/g><\/svg>$/u,
      '</svg>',
    ),
  };
}

export const LEARNINGBORED_PREVIEW_BOARD: LearningBoredBoardResult = {
  id: 'preview-board-settling-chamber',
  documentId: 'preview-waterworks',
  kind: 'process_flow',
  title: 'How the fictional settling chamber separates particles',
  titleSourceSpan: { sourceStart: 0, sourceEnd: LEARNINGBORED_PREVIEW_PASSAGE_TEXT.length },
  svg: canonicalBoardSvg,
  svgWithoutScaffold: canonicalBoardSvg.replace(
    /<g data-provenance="scaffold">[\s\S]*?<\/g><\/svg>$/u,
    '</svg>',
  ),
  outline: [
    {
      id: 'preview-node-inlet',
      kind: 'content',
      label: 'Water enters',
      description: 'Water enters the fictional chamber through an inlet.',
      provenance: 'anchored',
      sourceSpan: { sourceStart: 0, sourceEnd: 42 },
    },
    {
      id: 'preview-node-calming-zone',
      kind: 'content',
      label: 'Calming zone',
      description: 'The passage names a calming zone but does not define its construction.',
      provenance: 'anchored',
      sourceSpan: { sourceStart: 43, sourceEnd: 73 },
      undefined: true,
      undefinedConceptIds: ['preview-concept-calming-zone'],
    },
    {
      id: 'preview-node-figure',
      kind: 'figure',
      label: 'Settling chamber Figure',
      description:
        'A generic chamber receives water at one side, lets denser particles settle, and releases clarified water from an upper outlet.',
      provenance: 'anchored',
      sourceSpan: { sourceStart: 0, sourceEnd: LEARNINGBORED_PREVIEW_PASSAGE_TEXT.length },
      caption: 'Illustrative, generic settling chamber.',
      labels: [
        {
          id: 'preview-label-inlet',
          text: 'Inlet',
          description: 'Water enters the chamber.',
          at: { x: 0.14, y: 0.31 },
          provenance: 'anchored',
          sourceSpan: { sourceStart: 0, sourceEnd: 42 },
        },
        {
          id: 'preview-label-settling',
          text: 'Settling region',
          description: 'Denser particles move downward.',
          at: { x: 0.5, y: 0.54 },
          provenance: 'anchored',
          sourceSpan: { sourceStart: 74, sourceEnd: 105 },
        },
        {
          id: 'preview-label-outlet',
          text: 'Upper outlet',
          description: 'Clarified water leaves.',
          at: { x: 0.86, y: 0.27 },
          provenance: 'anchored',
          sourceSpan: { sourceStart: 106, sourceEnd: 151 },
        },
      ],
    },
    {
      id: 'preview-node-restatement',
      kind: 'content',
      label: 'A slower path gives particles time to sink',
      description:
        'This plainer restatement was added by LearningBored, not copied from the passage.',
      provenance: 'scaffold',
      scaffoldForm: 'restatement',
    },
    {
      id: 'relationship:preview-flow',
      kind: 'relationship',
      label: 'Calming zone → settling region',
      description: 'Slower flow allows denser particles to move downward.',
      provenance: 'anchored',
      sourceSpan: { sourceStart: 43, sourceEnd: 105 },
    },
  ],
  figures: [
    {
      id: 'preview-figure-settling-chamber',
      nodeId: 'preview-node-figure',
      description:
        'A generic chamber receives water at one side, lets denser particles settle, and releases clarified water from an upper outlet.',
      caption: 'Illustrative, generic settling chamber.',
      imageUrl: 'fixture-private://preview-figure-settling-chamber',
      provenance: 'anchored',
      sourceSpan: { sourceStart: 0, sourceEnd: LEARNINGBORED_PREVIEW_PASSAGE_TEXT.length },
      labels: [
        {
          id: 'preview-label-inlet',
          text: 'Inlet',
          description: 'Water enters the chamber.',
          at: { x: 0.14, y: 0.31 },
          provenance: 'anchored',
          sourceSpan: { sourceStart: 0, sourceEnd: 42 },
        },
        {
          id: 'preview-label-settling',
          text: 'Settling region',
          description: 'Denser particles move downward.',
          at: { x: 0.5, y: 0.54 },
          provenance: 'anchored',
          sourceSpan: { sourceStart: 74, sourceEnd: 105 },
        },
        {
          id: 'preview-label-outlet',
          text: 'Upper outlet',
          description: 'Clarified water leaves.',
          at: { x: 0.86, y: 0.27 },
          provenance: 'anchored',
          sourceSpan: { sourceStart: 106, sourceEnd: 151 },
        },
      ],
      projectionSvg: LEARNINGBORED_PREVIEW_FIGURE_PROJECTION,
      failed: false,
    },
  ],
  recallQuestions: [
    {
      id: 'preview-recall-order',
      kind: 'ordering',
      question: 'What happens after the fictional chamber slows the water?',
    },
  ],
};

export const LEARNINGBORED_PREVIEW_FIGURE_REPLACEMENT: Record<
  'queued' | 'completed' | 'failed',
  LearningBoredFigureRegenerationSnapshot
> = {
  queued: {
    id: 'preview-figure-regeneration',
    boardId: LEARNINGBORED_PREVIEW_BOARD.id,
    nodeId: 'preview-node-figure',
    clientRequestId: 'preview-client-request',
    issue: 'unclear',
    status: 'illustrating',
    chalkCost: 1,
    failureReason: null,
    refundConfirmed: false,
  },
  completed: {
    id: 'preview-figure-regeneration',
    boardId: LEARNINGBORED_PREVIEW_BOARD.id,
    nodeId: 'preview-node-figure',
    clientRequestId: 'preview-client-request',
    issue: 'unclear',
    status: 'completed',
    chalkCost: 1,
    failureReason: null,
    refundConfirmed: false,
  },
  failed: {
    id: 'preview-figure-regeneration',
    boardId: LEARNINGBORED_PREVIEW_BOARD.id,
    nodeId: 'preview-node-figure',
    clientRequestId: 'preview-client-request',
    issue: 'unclear',
    status: 'failed',
    chalkCost: 1,
    failureReason: 'The candidate Figure did not pass the depiction checks.',
    refundConfirmed: true,
  },
};

export const LEARNINGBORED_PREVIEW_COMPREHENSION: Record<
  'unanswered' | 'breakthrough' | 'stillUnclear',
  LearningBoredBoardComprehension
> = {
  unanswered: {
    boardId: LEARNINGBORED_PREVIEW_BOARD.id,
    passageId: 'preview-passage-settling-chamber',
    status: 'unanswered',
    outcome: null,
    feedbackId: null,
    respondedAt: null,
  },
  breakthrough: {
    boardId: LEARNINGBORED_PREVIEW_BOARD.id,
    passageId: 'preview-passage-settling-chamber',
    status: 'answered',
    outcome: 'breakthrough',
    feedbackId: 'preview-feedback-breakthrough',
    respondedAt: '2026-08-12T08:30:00.000Z',
  },
  stillUnclear: {
    boardId: LEARNINGBORED_PREVIEW_BOARD.id,
    passageId: 'preview-passage-settling-chamber',
    status: 'answered',
    outcome: 'still_unclear',
    feedbackId: 'preview-feedback-still-unclear',
    respondedAt: '2026-08-12T08:30:00.000Z',
  },
};

export const LEARNINGBORED_PREVIEW_PROGRESS_MASTERY: LearningBoredMasteryResult = {
  documentId: 'preview-waterworks',
  concepts: [
    {
      conceptId: 'preview-concept-settling',
      name: 'Settling sequence',
      score: 0.728,
      tier: 'lapsed',
      itemCount: 3,
      dueCount: 2,
      lastReviewedAt: '2026-08-10T08:30:00.000Z',
      boardIds: [LEARNINGBORED_PREVIEW_BOARD.id],
      dueItemIds: ['preview-recall-one', 'preview-recall-two'],
    },
    {
      conceptId: 'preview-concept-calming',
      name: 'Calming zone',
      score: 0.814,
      tier: 'learning',
      itemCount: 2,
      dueCount: 1,
      lastReviewedAt: '2026-08-11T09:10:00.000Z',
      boardIds: [LEARNINGBORED_PREVIEW_BOARD.id],
      dueItemIds: ['preview-recall-calming'],
    },
    {
      conceptId: 'preview-concept-outlet',
      name: 'Outlet position',
      score: null,
      tier: 'new',
      itemCount: 1,
      dueCount: 1,
      lastReviewedAt: null,
      boardIds: [LEARNINGBORED_PREVIEW_BOARD.id],
      dueItemIds: ['preview-recall-outlet'],
    },
    {
      conceptId: 'preview-concept-inlet',
      name: 'Inlet path',
      score: 0.944,
      tier: 'retained',
      itemCount: 2,
      dueCount: 0,
      lastReviewedAt: '2026-08-12T07:20:00.000Z',
      boardIds: [LEARNINGBORED_PREVIEW_BOARD.id],
      dueItemIds: [],
    },
  ],
  summary: { new: 1, learning: 1, retained: 1, lapsed: 1 },
  computedAt: '2026-08-12T08:30:00.000Z',
  derivationVersion: '1.0.0',
};

export const LEARNINGBORED_PREVIEW_PROGRESS_DOCUMENT: LearningBoredDocumentSummary = {
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
  lastOpenedAt: '2026-08-12T08:15:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-12T08:15:00.000Z',
};

export const LEARNINGBORED_PREVIEW_BLUEPRINT: LearningBoredBlueprint = {
  id: 'preview-blueprint-waterworks',
  name: 'Fictional Waterworks Operator',
  examCode: 'SAMPLE-200',
  objectives: [
    {
      id: 'preview-objective-flow',
      code: '1.0',
      title: 'Trace the treatment flow',
      weighting: 0.7,
      parentId: null,
      parentCode: null,
      sortOrder: 0,
    },
    {
      id: 'preview-objective-parts',
      code: '2.0',
      title: 'Locate generic chamber parts',
      weighting: 0.3,
      parentId: null,
      parentCode: null,
      sortOrder: 1,
    },
  ],
  weightingTotal: 1,
  weightingWarning: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-12T08:15:00.000Z',
};

export const LEARNINGBORED_PREVIEW_READINESS: LearningBoredReadinessResult = {
  documentId: LEARNINGBORED_PREVIEW_PROGRESS_DOCUMENT.id,
  blueprintId: LEARNINGBORED_PREVIEW_BLUEPRINT.id,
  overall: 0.701,
  objectives: [
    {
      objectiveId: 'preview-objective-flow',
      code: '1.0',
      title: 'Trace the treatment flow',
      weighting: 0.7,
      readiness: 0.728,
      status: 'in_progress',
      conceptCount: 2,
      startedConceptCount: 2,
      weakestConceptIds: ['preview-concept-settling', 'preview-concept-calming'],
    },
    {
      objectiveId: 'preview-objective-parts',
      code: '2.0',
      title: 'Locate generic chamber parts',
      weighting: 0.3,
      readiness: 0.944,
      status: 'in_progress',
      conceptCount: 2,
      startedConceptCount: 1,
      weakestConceptIds: ['preview-concept-outlet'],
    },
  ],
  conceptMappings: [
    {
      conceptId: 'preview-concept-settling',
      name: 'Settling sequence',
      isManual: false,
      mappings: [
        {
          objectiveId: 'preview-objective-flow',
          confidence: 0.86,
          isManual: false,
          mappingVersion: 'preview-lexical-v1',
        },
      ],
    },
    {
      conceptId: 'preview-concept-outlet',
      name: 'Outlet position',
      isManual: false,
      mappings: [
        {
          objectiveId: 'preview-objective-parts',
          confidence: 0.78,
          isManual: false,
          mappingVersion: 'preview-lexical-v1',
        },
      ],
    },
  ],
  computedAt: '2026-08-12T08:30:00.000Z',
  derivationVersion: '1.0.0',
};

export const LEARNINGBORED_PREVIEW_READINESS_NOT_STARTED: LearningBoredReadinessResult = {
  ...LEARNINGBORED_PREVIEW_READINESS,
  overall: null,
  objectives: LEARNINGBORED_PREVIEW_READINESS.objectives.map((objective) => ({
    ...objective,
    readiness: null,
    status: 'not_started' as const,
    startedConceptCount: 0,
  })),
};

export type LearningBoredStudyPanelPreviewMode =
  | 'ready'
  | 'loading'
  | 'error'
  | 'empty'
  | 'board-error'
  | 'readiness'
  | 'readiness-not-started';

function pendingPreviewResult<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** Deterministic read port for mounting the production Progress panel. */
export function createLearningBoredStudyPanelPreviewClient(
  mode: LearningBoredStudyPanelPreviewMode = 'ready',
): LearningBoredClient {
  const hasBlueprint = mode === 'readiness' || mode === 'readiness-not-started';
  const document = {
    ...LEARNINGBORED_PREVIEW_PROGRESS_DOCUMENT,
    blueprintId: hasBlueprint ? LEARNINGBORED_PREVIEW_BLUEPRINT.id : null,
  };
  const mastery =
    mode === 'empty'
      ? {
          ...LEARNINGBORED_PREVIEW_PROGRESS_MASTERY,
          concepts: [],
          summary: { new: 0, learning: 0, retained: 0, lapsed: 0 },
        }
      : LEARNINGBORED_PREVIEW_PROGRESS_MASTERY;

  return {
    getDocument: async () => {
      if (mode === 'loading') return pendingPreviewResult();
      if (mode === 'error') throw new Error('Deterministic progress read failed.');
      return document;
    },
    getDocumentMastery: async () => {
      if (mode === 'loading') return pendingPreviewResult();
      if (mode === 'error') throw new Error('Deterministic mastery read failed.');
      return mastery;
    },
    getDocumentReadiness: async () =>
      mode === 'readiness-not-started'
        ? LEARNINGBORED_PREVIEW_READINESS_NOT_STARTED
        : LEARNINGBORED_PREVIEW_READINESS,
    listBlueprints: async () => ({ blueprints: [LEARNINGBORED_PREVIEW_BLUEPRINT] }),
    getBoard: async () => {
      if (mode === 'board-error') throw new Error('Deterministic Board read failed.');
      return LEARNINGBORED_PREVIEW_BOARD;
    },
  } as unknown as LearningBoredClient;
}
