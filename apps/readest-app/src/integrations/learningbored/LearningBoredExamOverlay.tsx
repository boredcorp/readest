'use client';

import { AlertTriangle, Check, ChevronDown, Pencil, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
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
  const _ = useTranslation();
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
    <section className='rounded-xl border border-[var(--lb-progress-border)] bg-[var(--lb-progress-raised)] p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lb-progress-muted)]'>
            {_('Attached overlay')}
          </p>
          <h3 className='mt-1 text-lg font-semibold'>{_('Edit exam plan')}</h3>
        </div>
        <button
          type='button'
          className='btn btn-ghost btn-sm min-h-11 min-w-11'
          aria-label={_('Close exam plan editor')}
          onClick={onClose}
        >
          <X className='size-4' />
        </button>
      </div>

      {loading ? (
        <p className='mt-4 flex items-center gap-3' role='status'>
          <span className='loading loading-spinner' /> {_('Loading exam plan…')}
        </p>
      ) : draft && blueprint ? (
        <>
          <div className='mt-4 grid gap-3'>
            <label className='text-sm font-medium'>
              {_('Plan name')}
              <input
                className='input input-bordered mt-1 min-h-11 w-full'
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
              />
            </label>
            <label className='text-sm font-medium'>
              {_('Exam code')}
              <input
                className='input input-bordered mt-1 min-h-11 w-full'
                value={draft.examCode}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, examCode: event.target.value } : current,
                  )
                }
              />
            </label>
          </div>

          <fieldset className='mt-5 space-y-3'>
            <legend className='font-semibold'>{_('Objective weighting')}</legend>
            {draft.objectives.map((objective, index) => (
              <label
                key={objective.code}
                className='grid grid-cols-[1fr_7rem] items-center gap-3 text-sm'
              >
                <span>
                  <strong>{objective.code}</strong> {objective.title}
                </span>
                <span className='flex items-center gap-1'>
                  <input
                    type='number'
                    className='input input-bordered min-h-11 w-full'
                    min={0}
                    max={100}
                    step={0.1}
                    aria-label={_(`${objective.code} weighting percentage`)}
                    value={Number((objective.weighting * 100).toFixed(2))}
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
                  />
                  <span aria-hidden='true'>%</span>
                </span>
              </label>
            ))}
          </fieldset>

          {weightingWarning ? (
            <p className='mt-3 flex items-start gap-2 text-sm' role='alert'>
              <AlertTriangle className='mt-0.5 size-4 shrink-0' />
              {_(`Weighting totals ${precisePercentage(weightingTotal)}. It should total 100%.`)}
            </p>
          ) : (
            <p className='mt-3 flex items-center gap-2 text-sm' role='status'>
              <Check className='size-4' /> {_('Weighting totals 100%.')}
            </p>
          )}

          <button
            type='button'
            className='btn btn-primary mt-4 min-h-11 w-full'
            disabled={saving || !draft.name.trim()}
            onClick={() => void saveBlueprint()}
          >
            {saving ? _('Saving…') : _('Save exam plan')}
          </button>

          <div className='mt-6 border-t border-[var(--lb-progress-border)] pt-5'>
            <h4 className='font-semibold'>{_('Correct concept mappings')}</h4>
            <p className='mt-1 text-sm leading-6 text-[var(--lb-progress-muted)]'>
              {_('A saved correction stays manual when automatic mapping runs again.')}
            </p>
            <div className='mt-3 space-y-2'>
              {mastery.concepts.map((concept) => {
                const existing = mappingByConceptId.get(concept.conceptId);
                const selected = new Set(mappingSelections[concept.conceptId] ?? []);
                return (
                  <details
                    key={concept.conceptId}
                    className='rounded-lg border border-[var(--lb-progress-border)] p-3'
                  >
                    <summary className='flex min-h-11 cursor-pointer list-none items-center justify-between gap-3'>
                      <span className='font-medium'>{concept.name}</span>
                      <span className='flex items-center gap-2 text-xs'>
                        {existing?.isManual ? _('Manual') : _('Automatic')}
                        <ChevronDown className='size-4' aria-hidden='true' />
                      </span>
                    </summary>
                    <fieldset className='mt-3 space-y-2'>
                      <legend className='text-xs text-[var(--lb-progress-muted)]'>
                        {_('Choose every objective this concept supports.')}
                      </legend>
                      {blueprint.objectives.map((objective) => {
                        const currentMapping = existing?.mappings.find(
                          (mapping) => mapping.objectiveId === objective.id,
                        );
                        return (
                          <label
                            key={objective.id}
                            className='flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--lb-progress-border)] px-3 py-2 text-sm'
                          >
                            <input
                              type='checkbox'
                              className='checkbox checkbox-sm'
                              checked={selected.has(objective.id)}
                              onChange={(event) => {
                                setMappingSelections((current) => {
                                  const next = new Set(current[concept.conceptId] ?? []);
                                  if (event.target.checked) next.add(objective.id);
                                  else next.delete(objective.id);
                                  return { ...current, [concept.conceptId]: [...next] };
                                });
                              }}
                            />
                            <span className='min-w-0 flex-1'>
                              <strong>{objective.code}</strong> {objective.title}
                            </span>
                            {currentMapping ? (
                              <span className='text-xs text-[var(--lb-progress-muted)]'>
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
                      type='button'
                      className='btn btn-outline mt-3 min-h-11 w-full'
                      disabled={mappingPending !== null}
                      onClick={() =>
                        void saveMapping(masteryByConceptId.get(concept.conceptId) ?? concept)
                      }
                    >
                      {mappingPending === concept.conceptId
                        ? _('Saving correction…')
                        : _('Save manual mapping')}
                    </button>
                    {mappingStatus[concept.conceptId] ? (
                      <p className='mt-2 text-sm' role='status'>
                        {mappingStatus[concept.conceptId]}
                      </p>
                    ) : null}
                  </details>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {status ? (
        <p className='mt-3 text-sm' role='status'>
          {status}
        </p>
      ) : null}
      {error ? (
        <p className='mt-3 text-sm' role='alert'>
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
  const _ = useTranslation();
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
    <>
      <section aria-labelledby='learningbored-readiness-heading'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lb-progress-muted)]'>
              {_('Attached exam overlay')}
            </p>
            <h2 id='learningbored-readiness-heading' className='mt-1 text-2xl font-semibold'>
              {_('Readiness by objective')}
            </h2>
          </div>
          <button
            type='button'
            className='btn btn-outline btn-sm min-h-11'
            onClick={() => setEditorOpen(true)}
          >
            <Pencil className='size-4' /> {_('Edit exam plan')}
          </button>
        </div>
        <p className='mt-3 text-sm leading-6 text-[var(--lb-progress-muted)]'>
          {_('Heavily weighted weak areas appear first. Open one to work on its concepts.')}
        </p>

        <ol className='mt-4 space-y-3'>
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
            return (
              <li
                key={objective.objectiveId}
                className='rounded-xl border border-[var(--lb-progress-border)] bg-[var(--lb-progress-raised)] p-4'
              >
                <button
                  type='button'
                  className='min-h-14 w-full text-left'
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedObjectiveId((current) =>
                      current === objective.objectiveId ? null : objective.objectiveId,
                    )
                  }
                >
                  <span className='flex items-start justify-between gap-3'>
                    <span className='min-w-0'>
                      <span className='block text-xs font-semibold text-[var(--lb-progress-muted)]'>
                        {objective.code} · {_(`${percentage(objective.weighting)} weighting`)}
                      </span>
                      <span className='mt-1 block font-semibold'>{objective.title}</span>
                      <span className='mt-1 block text-xs text-[var(--lb-progress-muted)]'>
                        {_(
                          `${objective.startedConceptCount} of ${objective.conceptCount} concepts started`,
                        )}
                      </span>
                    </span>
                    <span className='flex shrink-0 items-center gap-2 text-sm font-semibold'>
                      {objective.readiness === null
                        ? _('Not started')
                        : _(percentage(objective.readiness))}
                      <ChevronDown className='size-4' aria-hidden='true' />
                    </span>
                    <span className='sr-only'>{_('Open concept details')}</span>
                  </span>
                </button>
                {expanded ? (
                  <LearningBoredConceptList
                    concepts={objectiveConcepts}
                    heading='Work on these concepts'
                    onOpenBoard={onOpenBoard}
                    onStartReview={onStartReview}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
};

export default LearningBoredExamOverlay;
