'use client';

import { AlertTriangle, Check, ChevronDown, Pencil, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type {
  LearningBoredBlueprint,
  LearningBoredClient,
  LearningBoredConceptMastery,
  LearningBoredDocumentConceptMapping,
  LearningBoredDocumentSummary,
  LearningBoredMasteryResult,
  LearningBoredObjectiveInput,
  LearningBoredObjectiveReadiness,
  LearningBoredReadinessResult,
} from './client';
import { LearningBoredConceptList } from './LearningBoredMastery';
import { useLearningBoredTranslation } from './presentation/context';
import { learningBoredProgressStyles as styles } from './progress/LearningBoredProgressShell';

export function sortLearningBoredObjectivesByWeightedWeakness(
  objectives: readonly LearningBoredObjectiveReadiness[],
): LearningBoredObjectiveReadiness[] {
  return [...objectives].sort(
    (left, right) =>
      (1 - (right.readiness ?? 0)) * right.weighting - (1 - (left.readiness ?? 0)) * left.weighting,
  );
}

function percentage(value: number): string {
  return `${Math.floor(value * 100)}%`;
}

function precisePercentage(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`;
}

interface ExamPlanEditorProps {
  client: LearningBoredClient;
  documentId: string;
  blueprintId: string;
  mastery: LearningBoredMasteryResult;
  conceptMappings: readonly LearningBoredDocumentConceptMapping[];
  onMappingUpdated: (mapping: LearningBoredDocumentConceptMapping) => void;
  onReadinessChanged: (readiness: LearningBoredReadinessResult) => void;
  onClose: () => void;
}

interface BlueprintDraft {
  name: string;
  examCode: string;
  objectives: LearningBoredObjectiveInput[];
}

function draftFromBlueprint(blueprint: LearningBoredBlueprint): BlueprintDraft {
  return {
    name: blueprint.name,
    examCode: blueprint.examCode ?? '',
    objectives: blueprint.objectives.map((objective) => ({
      code: objective.code,
      title: objective.title,
      weighting: objective.weighting,
      ...(objective.parentCode ? { parentCode: objective.parentCode } : {}),
      sortOrder: objective.sortOrder,
    })),
  };
}

const ExamPlanEditor: React.FC<ExamPlanEditorProps> = ({
  client,
  documentId,
  blueprintId,
  mastery,
  conceptMappings,
  onMappingUpdated,
  onReadinessChanged,
  onClose,
}) => {
  const _ = useLearningBoredTranslation();
  const translateRef = useRef(_);
  translateRef.current = _;
  const [blueprint, setBlueprint] = useState<LearningBoredBlueprint | null>(null);
  const [draft, setDraft] = useState<BlueprintDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [mappingSelections, setMappingSelections] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      conceptMappings.map((concept) => [
        concept.conceptId,
        concept.mappings.map((mapping) => mapping.objectiveId),
      ]),
    ),
  );
  const [mappingPending, setMappingPending] = useState<string | null>(null);
  const [mappingStatus, setMappingStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    void client
      .listBlueprints({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const attached =
          result.blueprints.find((candidate) => candidate.id === blueprintId) ?? null;
        if (!attached) {
          setError(translateRef.current('The attached exam plan could not be loaded.'));
          return;
        }
        setBlueprint(attached);
        setDraft(draftFromBlueprint(attached));
      })
      .catch((loadError) => {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        setError(translateRef.current('The attached exam plan could not be loaded.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [blueprintId, client]);

  const weightingTotal =
    draft?.objectives.reduce((total, objective) => total + objective.weighting, 0) ?? 0;
  const weightingWarning = Math.abs(weightingTotal - 1) > 0.000_001;
  const masteryByConceptId = useMemo(
    () => new Map(mastery.concepts.map((concept) => [concept.conceptId, concept])),
    [mastery.concepts],
  );
  const mappingByConceptId = useMemo(
    () => new Map(conceptMappings.map((mapping) => [mapping.conceptId, mapping])),
    [conceptMappings],
  );

  const saveBlueprint = async () => {
    if (!draft || !blueprint || saving) return;
    setSaving(true);
    setError(null);
    setStatus('');
    try {
      const updated = await client.patchBlueprint(blueprint.id, {
        name: draft.name.trim(),
        examCode: draft.examCode.trim() || null,
        objectives: draft.objectives,
      });
      setBlueprint(updated);
      setDraft(draftFromBlueprint(updated));
      const refreshedReadiness = await client.getDocumentReadiness(documentId);
      onReadinessChanged(refreshedReadiness);
      setStatus(_('Exam plan saved.'));
    } catch {
      setError(_('The exam plan could not be saved. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const saveMapping = async (concept: LearningBoredConceptMastery) => {
    if (mappingPending) return;
    setMappingPending(concept.conceptId);
    setError(null);
    try {
      const result = await client.setManualConceptMapping(documentId, concept.conceptId, {
        objectiveIds: mappingSelections[concept.conceptId] ?? [],
      });
      onMappingUpdated({
        conceptId: concept.conceptId,
        name: concept.name,
        isManual: true,
        mappings: result.mappings,
      });
      const refreshedReadiness = await client.getDocumentReadiness(documentId);
      onReadinessChanged(refreshedReadiness);
      setMappingStatus((current) => ({
        ...current,
        [concept.conceptId]: _('Manual mapping saved.'),
      }));
    } catch {
      setMappingStatus((current) => ({
        ...current,
        [concept.conceptId]: _('That mapping could not be saved. Please try again.'),
      }));
    } finally {
      setMappingPending(null);
    }
  };

  return (
    <section className={styles['editor']}>
      <div className={styles['editorHeader']}>
        <div>
          <h3 className={styles['sectionTitle']}>{_('Edit exam plan')}</h3>
          <p className={styles['supportCopy']}>{_('Attached exam overlay')}</p>
        </div>
        <button
          aria-label={_('Close exam plan editor')}
          className={styles['iconButton']}
          onClick={onClose}
          type='button'
        >
          <X aria-hidden='true' />
        </button>
      </div>

      {loading ? (
        <p className={styles['editorStatus']} role='status'>
          <span aria-hidden='true' className={styles['spinner']} /> {_('Loading exam plan…')}
        </p>
      ) : draft && blueprint ? (
        <>
          <div className={styles['fieldGrid']}>
            <label className={styles['field']}>
              <span className={styles['fieldLabel']}>{_('Plan name')}</span>
              <input
                className={styles['input']}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
              />
            </label>
            <label className={styles['field']}>
              <span className={styles['fieldLabel']}>{_('Exam code')}</span>
              <input
                className={styles['input']}
                value={draft.examCode}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, examCode: event.target.value } : current,
                  )
                }
              />
            </label>
          </div>

          <fieldset className={styles['weightingList']}>
            <legend className={styles['conceptName']}>{_('Objective weighting')}</legend>
            {draft.objectives.map((objective, index) => (
              <label className={styles['weightingRow']} key={objective.code}>
                <span>
                  <strong>{objective.code}</strong> {objective.title}
                </span>
                <span className={styles['weightingInput']}>
                  <input
                    aria-label={_(`${objective.code} weighting percentage`)}
                    className={styles['input']}
                    max={100}
                    min={0}
                    onChange={(event) => {
                      const weighting = Math.min(1, Math.max(0, Number(event.target.value) / 100));
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              objectives: current.objectives.map((candidate, candidateIndex) =>
                                candidateIndex === index ? { ...candidate, weighting } : candidate,
                              ),
                            }
                          : current,
                      );
                    }}
                    step={0.1}
                    type='number'
                    value={Number((objective.weighting * 100).toFixed(2))}
                  />
                  <span aria-hidden='true'>%</span>
                </span>
              </label>
            ))}
          </fieldset>

          {weightingWarning ? (
            <p className={styles['editorStatus']} data-tone='warning' role='alert'>
              <AlertTriangle aria-hidden='true' />
              {_(`Weighting totals ${precisePercentage(weightingTotal)}. It should total 100%.`)}
            </p>
          ) : (
            <p className={styles['editorStatus']} data-tone='success' role='status'>
              <Check aria-hidden='true' /> {_('Weighting totals 100%.')}
            </p>
          )}

          <button
            className={`${styles['primaryButton']} ${styles['fullWidth']}`}
            disabled={saving || !draft.name.trim()}
            onClick={() => void saveBlueprint()}
            type='button'
          >
            {saving ? _('Saving…') : _('Save exam plan')}
          </button>

          <div className={styles['mappingSection']}>
            <h4 className={styles['conceptName']}>{_('Correct concept mappings')}</h4>
            <p className={styles['supportCopy']}>
              {_('A saved correction stays manual when automatic mapping runs again.')}
            </p>
            <div className={styles['mappingList']}>
              {mastery.concepts.map((concept) => {
                const existing = mappingByConceptId.get(concept.conceptId);
                const selected = new Set(mappingSelections[concept.conceptId] ?? []);
                return (
                  <details className={styles['mappingDetails']} key={concept.conceptId}>
                    <summary className={styles['mappingSummary']}>
                      <span className={styles['conceptName']}>{concept.name}</span>
                      <span className={styles['objectiveCodeRow']}>
                        {existing?.isManual ? _('Manual') : _('Automatic')}
                        <ChevronDown aria-hidden='true' className={styles['objectiveChevron']} />
                      </span>
                    </summary>
                    <div className={styles['mappingBody']}>
                      <fieldset className={styles['mappingChoices']}>
                        <legend className={styles['supportCopy']}>
                          {_('Choose every objective this concept supports.')}
                        </legend>
                        {blueprint.objectives.map((objective) => {
                          const currentMapping = existing?.mappings.find(
                            (mapping) => mapping.objectiveId === objective.id,
                          );
                          return (
                            <label className={styles['mappingChoice']} key={objective.id}>
                              <input
                                checked={selected.has(objective.id)}
                                onChange={(event) => {
                                  setMappingSelections((current) => {
                                    const next = new Set(current[concept.conceptId] ?? []);
                                    if (event.target.checked) next.add(objective.id);
                                    else next.delete(objective.id);
                                    return { ...current, [concept.conceptId]: [...next] };
                                  });
                                }}
                                type='checkbox'
                              />
                              <span>
                                <strong>{objective.code}</strong> {objective.title}
                              </span>
                              {currentMapping ? (
                                <span className={styles['mappingMatch']}>
                                  {currentMapping.isManual
                                    ? _('Manual')
                                    : _(`${Math.floor(currentMapping.confidence * 100)}% match`)}
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </fieldset>
                      <button
                        className={`${styles['secondaryButton']} ${styles['fullWidth']}`}
                        disabled={mappingPending !== null}
                        onClick={() =>
                          void saveMapping(masteryByConceptId.get(concept.conceptId) ?? concept)
                        }
                        type='button'
                      >
                        {mappingPending === concept.conceptId
                          ? _('Saving correction…')
                          : _('Save manual mapping')}
                      </button>
                      {mappingStatus[concept.conceptId] ? (
                        <p className={styles['editorStatus']} role='status'>
                          {mappingStatus[concept.conceptId]}
                        </p>
                      ) : null}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {status ? (
        <p className={styles['editorStatus']} data-tone='success' role='status'>
          {status}
        </p>
      ) : null}
      {error ? (
        <p className={styles['editorStatus']} data-tone='error' role='alert'>
          {error}
        </p>
      ) : null}
    </section>
  );
};

export interface LearningBoredExamOverlayProps {
  client: LearningBoredClient;
  document: LearningBoredDocumentSummary;
  mastery: LearningBoredMasteryResult;
  readiness: LearningBoredReadinessResult;
  onOpenBoard: (boardId: string) => void;
  onStartReview: (conceptId: string) => void;
}

const LearningBoredExamOverlay: React.FC<LearningBoredExamOverlayProps> = ({
  client,
  document,
  mastery,
  readiness,
  onOpenBoard,
  onStartReview,
}) => {
  const _ = useLearningBoredTranslation();
  const [editorOpen, setEditorOpen] = useState(false);
  const [expandedObjectiveId, setExpandedObjectiveId] = useState<string | null>(null);
  const [currentReadiness, setCurrentReadiness] = useState(readiness);
  const conceptMappings = currentReadiness.conceptMappings;
  const sortedObjectives = sortLearningBoredObjectivesByWeightedWeakness(
    currentReadiness.objectives,
  );
  const conceptsById = useMemo(
    () => new Map(mastery.concepts.map((concept) => [concept.conceptId, concept])),
    [mastery.concepts],
  );

  if (editorOpen) {
    return (
      <ExamPlanEditor
        client={client}
        documentId={document.id}
        blueprintId={currentReadiness.blueprintId}
        mastery={mastery}
        conceptMappings={conceptMappings}
        onMappingUpdated={(updated) =>
          setCurrentReadiness((current) => ({
            ...current,
            conceptMappings: [
              ...current.conceptMappings.filter(
                (mapping) => mapping.conceptId !== updated.conceptId,
              ),
              updated,
            ],
          }))
        }
        onReadinessChanged={setCurrentReadiness}
        onClose={() => setEditorOpen(false)}
      />
    );
  }

  return (
    <section aria-labelledby='learningbored-readiness-heading' className={styles['section']}>
      <div className={styles['overlayHeader']}>
        <div>
          <h2 className={styles['sectionTitle']} id='learningbored-readiness-heading'>
            {_('Readiness by objective')}
          </h2>
          <p className={styles['supportCopy']}>{_('Attached exam overlay')}</p>
        </div>
        <button
          className={styles['secondaryButton']}
          onClick={() => setEditorOpen(true)}
          type='button'
        >
          <Pencil aria-hidden='true' /> {_('Edit exam plan')}
        </button>
      </div>
      <p className={styles['sectionCopy']}>
        {_('Heavily weighted weak areas appear first. Open one to work on its concepts.')}
      </p>

      <ol className={styles['objectiveList']}>
        {sortedObjectives.map((objective) => {
          const mappedConceptIds = conceptMappings.flatMap((concept) =>
            concept.mappings.some((mapping) => mapping.objectiveId === objective.objectiveId)
              ? [concept.conceptId]
              : [],
          );
          const objectiveConceptIds = [
            ...new Set([...objective.weakestConceptIds, ...mappedConceptIds]),
          ];
          const objectiveConcepts = objectiveConceptIds.flatMap((conceptId) => {
            const concept = conceptsById.get(conceptId);
            return concept ? [concept] : [];
          });
          const expanded = expandedObjectiveId === objective.objectiveId;
          const detailsId = `learningbored-objective-${objective.objectiveId}`;
          return (
            <li
              className={styles['objectiveCard']}
              data-expanded={expanded ? 'true' : 'false'}
              key={objective.objectiveId}
            >
              <button
                aria-controls={detailsId}
                aria-expanded={expanded}
                className={styles['objectiveToggle']}
                onClick={() =>
                  setExpandedObjectiveId((current) =>
                    current === objective.objectiveId ? null : objective.objectiveId,
                  )
                }
                type='button'
              >
                <span>
                  <span className={styles['objectiveCode']}>
                    {objective.code} · {_(`${percentage(objective.weighting)} weighting`)}
                  </span>
                  <span className={styles['objectiveTitle']}>{objective.title}</span>
                  <span className={styles['objectiveMeta']}>
                    {_(
                      `${objective.startedConceptCount} of ${objective.conceptCount} concepts started`,
                    )}
                  </span>
                </span>
                <span className={styles['objectiveValue']}>
                  <strong className={styles['readiness']}>
                    {objective.readiness === null
                      ? _('Not started')
                      : _(percentage(objective.readiness))}
                  </strong>
                  <ChevronDown aria-hidden='true' className={styles['objectiveChevron']} />
                </span>
                <span className='sr-only'>{_('Open concept details')}</span>
              </button>
              {expanded ? (
                <div className={styles['objectiveDetails']} id={detailsId}>
                  <LearningBoredConceptList
                    concepts={objectiveConcepts}
                    emptyMessage='No grounded concepts map to this objective yet.'
                    heading='Work on these concepts'
                    onOpenBoard={onOpenBoard}
                    onStartReview={onStartReview}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default LearningBoredExamOverlay;
