import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
}));

import LearningBoredProgressPanel from '@/integrations/learningbored/LearningBoredProgressPanel';
import LearningBoredExamOverlay from '@/integrations/learningbored/LearningBoredExamOverlay';
import { LearningBoredConceptList } from '@/integrations/learningbored/LearningBoredMastery';
import { LearningBoredPresentationThemeProvider } from '@/integrations/learningbored/presentation/context';
import type {
  LearningBoredBlueprint,
  LearningBoredClient,
  LearningBoredDocumentSummary,
  LearningBoredMasteryResult,
  LearningBoredReadinessResult,
} from '@/integrations/learningbored/client';

const DOCUMENT: LearningBoredDocumentSummary = {
  id: 'document-1',
  title: 'Fictional systems lesson',
  author: 'A. Example',
  format: 'EPUB',
  sourceType: 'upload',
  readerBookId: 'book-1',
  pageCount: null,
  blueprintId: null,
  boardCount: 2,
  recallItemCount: 5,
  dueCount: 3,
  lastOpenedAt: '2026-08-03T10:00:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
};

const MASTERY: LearningBoredMasteryResult = {
  documentId: DOCUMENT.id,
  concepts: [
    {
      conceptId: 'concept-new',
      name: 'Fictional regulator',
      score: null,
      tier: 'new',
      itemCount: 1,
      dueCount: 0,
      lastReviewedAt: null,
      boardIds: ['board-new'],
      dueItemIds: [],
    },
    {
      conceptId: 'concept-lapsed',
      name: 'Fictional signal path',
      score: 0.728,
      tier: 'lapsed',
      itemCount: 4,
      dueCount: 3,
      lastReviewedAt: '2026-07-21T10:00:00.000Z',
      boardIds: ['board-lapsed'],
      dueItemIds: ['recall-1', 'recall-2', 'recall-3'],
    },
  ],
  summary: { new: 1, learning: 0, retained: 0, lapsed: 1 },
  computedAt: '2026-08-03T10:00:00.000Z',
  derivationVersion: '1.0.0',
};

const BLUEPRINT: LearningBoredBlueprint = {
  id: 'blueprint-1',
  name: 'Fictional Operations Associate',
  examCode: 'SAMPLE-100',
  objectives: [
    {
      id: 'objective-heavy',
      code: '1.0',
      title: 'Heavy weak area',
      weighting: 0.7,
      parentId: null,
      parentCode: null,
      sortOrder: 0,
    },
    {
      id: 'objective-light',
      code: '2.0',
      title: 'Light strong area',
      weighting: 0.3,
      parentId: null,
      parentCode: null,
      sortOrder: 1,
    },
  ],
  weightingTotal: 1,
  weightingWarning: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
};

const READINESS: LearningBoredReadinessResult = {
  documentId: DOCUMENT.id,
  blueprintId: BLUEPRINT.id,
  overall: 0.64,
  objectives: [
    {
      objectiveId: 'objective-light',
      code: '2.0',
      title: 'Light strong area',
      weighting: 0.3,
      readiness: 0.9,
      status: 'in_progress',
      conceptCount: 1,
      startedConceptCount: 1,
      weakestConceptIds: ['concept-new'],
    },
    {
      objectiveId: 'objective-heavy',
      code: '1.0',
      title: 'Heavy weak area',
      weighting: 0.7,
      readiness: 0.728,
      status: 'in_progress',
      conceptCount: 1,
      startedConceptCount: 1,
      weakestConceptIds: ['concept-lapsed'],
    },
  ],
  conceptMappings: [
    {
      conceptId: 'concept-new',
      name: 'Fictional regulator',
      isManual: false,
      mappings: [
        {
          objectiveId: 'objective-light',
          confidence: 0.7,
          isManual: false,
          mappingVersion: 'lexical-v1',
        },
      ],
    },
    {
      conceptId: 'concept-lapsed',
      name: 'Fictional signal path',
      isManual: false,
      mappings: [
        {
          objectiveId: 'objective-heavy',
          confidence: 0.8,
          isManual: false,
          mappingVersion: 'lexical-v1',
        },
      ],
    },
  ],
  computedAt: '2026-08-03T10:00:00.000Z',
  derivationVersion: '1.0.0',
};

function loadExamOverlayFixture() {
  return Promise.resolve({ default: LearningBoredExamOverlay });
}

function createClient(input?: {
  document?: LearningBoredDocumentSummary;
  mastery?: LearningBoredMasteryResult;
  readiness?: LearningBoredReadinessResult;
  blueprint?: LearningBoredBlueprint;
}) {
  const document = input?.document ?? DOCUMENT;
  const mastery = input?.mastery ?? MASTERY;
  const readiness = input?.readiness ?? READINESS;
  const blueprint = input?.blueprint ?? BLUEPRINT;
  return {
    getDocument: vi.fn(async () => document),
    getDocumentMastery: vi.fn(async () => mastery),
    getDocumentReadiness: vi.fn(async () => readiness),
    getBoard: vi.fn(async (boardId: string) => ({
      id: boardId,
      documentId: DOCUMENT.id,
      kind: 'concept_map' as const,
      title: 'Fictional signal Board',
      titleSourceSpan: { sourceStart: 0, sourceEnd: 12 },
      svg: null,
      outline: [
        {
          id: 'node-1',
          kind: 'content' as const,
          label: 'Signal source',
          description: 'The fictional source begins the signal path.',
          provenance: 'anchored' as const,
          sourceSpan: { sourceStart: 0, sourceEnd: 12 },
        },
      ],
      figures: [],
      recallQuestions: [],
    })),
    listBlueprints: vi.fn(async () => ({ blueprints: [blueprint] })),
    patchBlueprint: vi.fn(
      async (_id: string, patch: { objectives?: typeof blueprint.objectives }) => ({
        ...blueprint,
        objectives: patch.objectives
          ? blueprint.objectives.map((objective, index) => ({
              ...objective,
              weighting: patch.objectives?.[index]?.weighting ?? objective.weighting,
            }))
          : blueprint.objectives,
      }),
    ),
    setManualConceptMapping: vi.fn(
      async (_documentId: string, conceptId: string, request: { objectiveIds: string[] }) => ({
        documentId: DOCUMENT.id,
        conceptId,
        mappings: request.objectiveIds.map((objectiveId) => ({
          objectiveId,
          confidence: 1,
          isManual: true,
          mappingVersion: null,
        })),
      }),
    ),
  } as unknown as LearningBoredClient;
}

afterEach(() => cleanup());

describe('LearningBored progress panel', () => {
  it('inherits the selected Reader theme through a scoped Miura study shell', async () => {
    const client = createClient({ document: { ...DOCUMENT, blueprintId: null } });
    const rendered = render(
      <LearningBoredPresentationThemeProvider value='eink'>
        <LearningBoredProgressPanel
          client={client}
          documentId={DOCUMENT.id}
          onClose={vi.fn()}
          onStartReview={vi.fn()}
        />
      </LearningBoredPresentationThemeProvider>,
    );

    const panel = await screen.findByRole('complementary', {
      name: 'LearningBored progress panel',
    });
    expect(panel.classList.contains('lb-presentation')).toBe(true);
    expect(panel.getAttribute('data-lb-presentation')).toBe('progress-work-surface');
    expect(panel.getAttribute('data-lb-theme')).toBe('eink');
    expect(rendered.container.querySelector('style')).toBeNull();
  });

  it('selects a concept before exposing its due items, Board links, and review action', async () => {
    const client = createClient({ document: { ...DOCUMENT, blueprintId: null } });
    const onStartReview = vi.fn();
    render(
      <LearningBoredProgressPanel
        client={client}
        documentId={DOCUMENT.id}
        onClose={vi.fn()}
        onStartReview={onStartReview}
      />,
    );

    const conceptHeading = await screen.findByRole('heading', {
      name: 'Fictional signal path',
    });
    const card = conceptHeading.closest('li');
    expect(card).toBeTruthy();
    expect(
      within(card!).queryByRole('region', {
        name: '3 due items for Fictional signal path',
      }),
    ).toBeNull();

    const disclosure = within(card!).getByRole('button', {
      name: /Fictional signal path.*Lapsed.*72%.*3 due/u,
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');

    const dueItems = within(card!).getByRole('region', {
      name: '3 due items for Fictional signal path',
    });
    expect(within(dueItems).getAllByRole('listitem')).toHaveLength(3);
    expect(within(card!).getByRole('button', { name: 'Open Board' })).toBeTruthy();

    fireEvent.click(within(card!).getByRole('button', { name: 'Review this concept' }));
    expect(onStartReview).toHaveBeenCalledWith(DOCUMENT.id, 'concept-lapsed');
  });

  it('does not advertise a nonexistent action for a legacy concept without due items or Boards', () => {
    render(
      <LearningBoredConceptList
        concepts={[
          {
            conceptId: 'concept-legacy',
            name: 'Fictional legacy concept',
            score: null,
            tier: 'new',
            itemCount: 0,
            dueCount: 0,
            lastReviewedAt: null,
            boardIds: [],
            dueItemIds: [],
          },
        ]}
        onOpenBoard={vi.fn()}
        onStartReview={vi.fn()}
      />,
    );

    const card = screen.getByRole('heading', { name: 'Fictional legacy concept' }).closest('li');
    expect(card).toBeTruthy();
    const disclosure = within(card!).getByRole('button', {
      name: /Fictional legacy concept.*New.*Not started.*No items due/u,
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(within(card!).queryByText('Open Board')).toBeNull();
    expect(within(card!).queryByText('Review this concept')).toBeNull();
    expect(within(card!).getByText('Not started')).toBeTruthy();
  });

  it('shows actionable concept mastery without requesting or exposing the optional overlay', async () => {
    const client = createClient({ document: { ...DOCUMENT, blueprintId: null } });
    const onStartReview = vi.fn();
    const loadExamOverlay = vi.fn(loadExamOverlayFixture);
    render(
      <LearningBoredProgressPanel
        client={client}
        documentId={DOCUMENT.id}
        onClose={vi.fn()}
        onStartReview={onStartReview}
        loadExamOverlay={loadExamOverlay}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Concept progress' })).toBeTruthy();
    expect(client.getDocument).toHaveBeenCalledTimes(1);
    expect(client.getDocumentMastery).toHaveBeenCalledTimes(1);
    expect(client.getDocumentReadiness).not.toHaveBeenCalled();
    expect(loadExamOverlay).not.toHaveBeenCalled();
    expect(screen.queryByText(/exam|objective|blueprint|readiness/iu)).toBeNull();

    const conceptHeadings = screen.getAllByRole('heading', { level: 4 });
    expect(conceptHeadings.map((heading) => heading.textContent)).toEqual([
      'Fictional signal path',
      'Fictional regulator',
    ]);
    expect(screen.getByText('72%')).toBeTruthy();
    expect(screen.queryByText('73%')).toBeNull();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Learning: 0' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Retained: 0' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    const reviewedMasteryAction = screen.getByRole('button', {
      name: /Fictional signal path.*Lapsed.*72%.*3 due/u,
    });
    expect(reviewedMasteryAction.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-07-21T10:00:00.000Z',
    );
    fireEvent.click(reviewedMasteryAction);
    fireEvent.click(screen.getByRole('button', { name: 'Review this concept' }));
    expect(onStartReview).toHaveBeenCalledWith(DOCUMENT.id, 'concept-lapsed');

    fireEvent.click(screen.getByRole('button', { name: 'New: 1' }));
    expect(screen.getByRole('heading', { name: 'Fictional regulator' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Fictional signal path' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: /Fictional regulator.*New.*Not started.*No items due/u,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Board' }));
    expect(await screen.findByRole('heading', { name: 'Fictional signal Board' })).toBeTruthy();
    expect(client.getBoard).toHaveBeenLastCalledWith('board-new', { includeScaffold: false });
    fireEvent.click(screen.getByRole('button', { name: 'Back to progress' }));

    fireEvent.click(screen.getByRole('button', { name: '2 concepts' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Fictional signal path.*Lapsed.*72%.*3 due/u }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review this concept' }));
    expect(onStartReview).toHaveBeenCalledWith(DOCUMENT.id, 'concept-lapsed');

    const openBoardButtons = screen.getAllByRole('button', { name: 'Open Board' });
    fireEvent.click(openBoardButtons[0]!);
    expect(await screen.findByRole('heading', { name: 'Fictional signal Board' })).toBeTruthy();
    expect(screen.getByText('The fictional source begins the signal path.')).toBeTruthy();
  });

  it('orders attached objectives by weighted weakness and edits only the existing plan', async () => {
    const attachedMastery: LearningBoredMasteryResult = {
      ...MASTERY,
      concepts: [
        ...MASTERY.concepts,
        {
          conceptId: 'concept-unmapped',
          name: 'Fictional unmapped bridge',
          score: 0.41,
          tier: 'learning',
          itemCount: 1,
          dueCount: 0,
          lastReviewedAt: '2026-08-02T10:00:00.000Z',
          boardIds: ['board-unmapped'],
          dueItemIds: [],
        },
      ],
      summary: { new: 1, learning: 1, retained: 0, lapsed: 1 },
    };
    const client = createClient({
      document: { ...DOCUMENT, blueprintId: BLUEPRINT.id },
      mastery: attachedMastery,
    });
    const loadExamOverlay = vi.fn(loadExamOverlayFixture);
    render(
      <LearningBoredProgressPanel
        client={client}
        documentId={DOCUMENT.id}
        onClose={vi.fn()}
        onStartReview={vi.fn()}
        loadExamOverlay={loadExamOverlay}
      />,
    );

    const readinessHeading = await screen.findByRole('heading', {
      name: 'Readiness by objective',
    });
    expect(loadExamOverlay).toHaveBeenCalledTimes(1);
    expect(client.getDocumentReadiness).toHaveBeenCalledTimes(1);
    const conceptHeading = screen.getByRole('heading', { name: 'Concept progress' });
    expect(
      readinessHeading.compareDocumentPosition(conceptHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.getByRole('heading', { name: 'Fictional unmapped bridge' })).toBeTruthy();
    expect(screen.queryByText('64%')).toBeNull();
    const objectiveButtons = screen.getAllByRole('button', { name: /Open concept details/u });
    expect(objectiveButtons[0]?.textContent).toContain('Heavy weak area');
    expect(objectiveButtons[1]?.textContent).toContain('Light strong area');
    expect(objectiveButtons[0]?.getAttribute('aria-label')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: /70% weighting.*Heavy weak area.*1 of 1 concepts started.*72%.*Open concept details/u,
      }),
    ).toBeTruthy();
    expect(within(objectiveButtons[0]!).getByText(/70% weighting/u)).toBeTruthy();
    expect(within(objectiveButtons[0]!).getByText('72%')).toBeTruthy();
    expect(within(objectiveButtons[0]!).queryByText('73%')).toBeNull();

    fireEvent.click(objectiveButtons[0]!);
    const heavyObjective = objectiveButtons[0]!.closest('li');
    expect(heavyObjective).toBeTruthy();
    expect(
      within(heavyObjective!).getByRole('heading', { name: 'Fictional signal path' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit exam plan' }));
    expect(await screen.findByRole('heading', { name: 'Edit exam plan' })).toBeTruthy();
    expect(client.listBlueprints).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('1.0 weighting percentage'), {
      target: { value: '60' },
    });
    expect(screen.getByRole('alert').textContent).toContain('Weighting totals 90%');
    fireEvent.click(screen.getByRole('button', { name: 'Save exam plan' }));
    await waitFor(() => expect(client.patchBlueprint).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.getDocumentReadiness).toHaveBeenCalledTimes(2));

    const editor = screen.getByRole('heading', { name: 'Edit exam plan' }).closest('section');
    expect(editor).toBeTruthy();
    const regulatorDetails = within(editor!).getByText('Fictional regulator').closest('details');
    expect(regulatorDetails).toBeTruthy();
    fireEvent.click(within(regulatorDetails!).getByText('Fictional regulator'));
    const objectiveCheckbox = within(regulatorDetails!).getByRole('checkbox', {
      name: /1.0 Heavy weak area/u,
    });
    fireEvent.click(objectiveCheckbox);
    fireEvent.click(within(regulatorDetails!).getByRole('button', { name: 'Save manual mapping' }));
    await waitFor(() =>
      expect(client.setManualConceptMapping).toHaveBeenCalledWith(DOCUMENT.id, 'concept-new', {
        objectiveIds: ['objective-light', 'objective-heavy'],
      }),
    );
    expect(client.getDocumentReadiness).toHaveBeenCalledTimes(3);
    expect(within(regulatorDetails!).getByText('Manual mapping saved.')).toBeTruthy();
  });

  it('keeps concept progress actionable when optional readiness fails and retries it locally', async () => {
    const client = createClient({ document: { ...DOCUMENT, blueprintId: BLUEPRINT.id } });
    vi.mocked(client.getDocumentReadiness)
      .mockRejectedValueOnce(new Error('readiness unavailable'))
      .mockResolvedValueOnce(READINESS);
    const loadExamOverlay = vi.fn(loadExamOverlayFixture);

    render(
      <LearningBoredProgressPanel
        client={client}
        documentId={DOCUMENT.id}
        onClose={vi.fn()}
        onStartReview={vi.fn()}
        loadExamOverlay={loadExamOverlay}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Concept progress' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fictional signal path' })).toBeTruthy();
    expect(
      await screen.findByText(
        'Exam readiness could not be loaded. Concept progress is still available.',
      ),
    ).toBeTruthy();
    expect(loadExamOverlay).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try exam progress again' }));
    expect(await screen.findByRole('heading', { name: 'Readiness by objective' })).toBeTruthy();
    expect(client.getDocumentReadiness).toHaveBeenCalledTimes(2);
    expect(loadExamOverlay).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Concept progress' })).toBeTruthy();
  });

  it('keeps concept progress available when the optional overlay chunk fails and retries locally', async () => {
    const client = createClient({ document: { ...DOCUMENT, blueprintId: BLUEPRINT.id } });
    const loadExamOverlay = vi
      .fn<() => ReturnType<typeof loadExamOverlayFixture>>()
      .mockRejectedValueOnce(new Error('overlay unavailable'))
      .mockImplementation(loadExamOverlayFixture);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <LearningBoredProgressPanel
        client={client}
        documentId={DOCUMENT.id}
        onClose={vi.fn()}
        onStartReview={vi.fn()}
        loadExamOverlay={loadExamOverlay}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Concept progress' })).toBeTruthy();
    expect(
      await screen.findByText(
        'Exam readiness could not be opened. Concept progress is still available.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try exam view again' }));
    expect(await screen.findByRole('heading', { name: 'Readiness by objective' })).toBeTruthy();
    expect(loadExamOverlay).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Concept progress' })).toBeTruthy();
  });

  it('uses truthful contextual copy when an expanded objective has no mapped concepts', async () => {
    const readiness: LearningBoredReadinessResult = {
      ...READINESS,
      objectives: [
        {
          ...READINESS.objectives[0]!,
          conceptCount: 0,
          startedConceptCount: 0,
          weakestConceptIds: [],
        },
      ],
      conceptMappings: [],
    };
    const client = createClient({
      document: { ...DOCUMENT, blueprintId: BLUEPRINT.id },
      readiness,
    });

    render(
      <LearningBoredProgressPanel
        client={client}
        documentId={DOCUMENT.id}
        onClose={vi.fn()}
        onStartReview={vi.fn()}
        loadExamOverlay={loadExamOverlayFixture}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Open concept details/u }));
    expect(screen.getByText('No grounded concepts map to this objective yet.')).toBeTruthy();
    expect(screen.queryByText('No grounded concepts are available yet.')).toBeNull();
  });

  it('keeps not-started readiness distinct from a started zero', async () => {
    const readiness: LearningBoredReadinessResult = {
      ...READINESS,
      overall: 0,
      objectives: [
        {
          ...READINESS.objectives[0]!,
          readiness: null,
          status: 'not_started',
          startedConceptCount: 0,
        },
        {
          ...READINESS.objectives[1]!,
          readiness: 0,
          status: 'in_progress',
          startedConceptCount: 1,
        },
      ],
    };
    const client = createClient({
      document: { ...DOCUMENT, blueprintId: BLUEPRINT.id },
      readiness,
    });
    const loadExamOverlay = vi.fn(loadExamOverlayFixture);

    render(
      <LearningBoredProgressPanel
        client={client}
        documentId={DOCUMENT.id}
        onClose={vi.fn()}
        onStartReview={vi.fn()}
        loadExamOverlay={loadExamOverlay}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Readiness by objective' })).toBeTruthy();
    expect(loadExamOverlay).toHaveBeenCalledTimes(1);
    const objectiveButtons = screen.getAllByRole('button', { name: /Open concept details/u });
    const zeroObjective = objectiveButtons.find((button) =>
      button.textContent?.includes('Heavy weak area'),
    );
    const notStartedObjective = objectiveButtons.find((button) =>
      button.textContent?.includes('Light strong area'),
    );
    expect(zeroObjective).toBeTruthy();
    expect(notStartedObjective).toBeTruthy();
    expect(within(zeroObjective!).getByText('0%')).toBeTruthy();
    expect(within(notStartedObjective!).getByText('Not started')).toBeTruthy();
    expect(within(notStartedObjective!).queryByText('0%')).toBeNull();
  });
});
