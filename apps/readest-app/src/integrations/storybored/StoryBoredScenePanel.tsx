'use client';

import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, ImagePlus, RefreshCcw, Send, Star, ThumbsDown, ThumbsUp, X } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { createStoryBoredReaderClient, isStoryBoredReaderEnabled } from './client';
import { StoryBoredLogoMarkIcon } from './StoryBoredLogo';
import {
  buildStoryBoredFeedbackPayload,
  isStoryBoredFeedbackDraftReady,
  type StoryBoredFeedbackDraft,
} from './feedback';
import {
  clearStoryBoredSceneSession,
  isStoryBoredSceneActive,
  writeStoryBoredSceneSession,
} from './session';
import type {
  StoryBoredFeedbackCategory,
  StoryBoredPassage,
  StoryBoredSceneGeneration,
  StoryBoredSceneStatus,
  StoryBoredStylePreset,
} from './types';

const ACTIVE_STATUSES = new Set<StoryBoredSceneStatus>(['queued', 'prompting', 'generating']);
const RETRYABLE_STATUSES = new Set<StoryBoredSceneStatus>(['failed', 'cancelled']);

const STYLE_OPTIONS: Array<{ value: StoryBoredStylePreset; label: string }> = [
  { value: 'cinematic-literary', label: 'Cinematic literary' },
  { value: 'watercolor-illustration', label: 'Watercolor illustration' },
  { value: 'dark-fantasy', label: 'Dark fantasy' },
  { value: 'soft-storybook', label: 'Soft storybook' },
  { value: 'realistic-concept-art', label: 'Realistic concept art' },
  { value: 'monochrome-sketch', label: 'Monochrome sketch' },
];

const FEEDBACK_CATEGORY_OPTIONS: Array<{ value: StoryBoredFeedbackCategory; label: string }> = [
  { value: 'matched-scene', label: 'Matched scene' },
  { value: 'wrong-scene', label: 'Wrong scene' },
  { value: 'style-mismatch', label: 'Style mismatch' },
  { value: 'low-quality', label: 'Low quality' },
  { value: 'unsafe-or-inappropriate', label: 'Unsafe' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_FEEDBACK_DRAFT: StoryBoredFeedbackDraft = {
  rating: 4,
  matchedScene: null,
  category: '',
  comment: '',
};

interface StoryBoredScenePanelProps {
  isOpen: boolean;
  passage: StoryBoredPassage | null;
  generationId?: string | null;
  onGenerationChange?: (generation: StoryBoredSceneGeneration | null) => void;
  onClose: () => void;
}

function getStatusLabel(status?: StoryBoredSceneStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'prompting':
      return 'Building prompt';
    case 'generating':
      return 'Generating';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Ready';
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'StoryBored request failed.';
}

const StoryBoredScenePanel: React.FC<StoryBoredScenePanelProps> = ({
  isOpen,
  passage,
  generationId,
  onGenerationChange,
  onClose,
}) => {
  const _ = useTranslation();
  const { token, user } = useAuth();
  const userId = user?.id ?? null;
  const [stylePreset, setStylePreset] = useState<StoryBoredStylePreset>('cinematic-literary');
  const [generation, setGeneration] = useState<StoryBoredSceneGeneration | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackDraft, setFeedbackDraft] =
    useState<StoryBoredFeedbackDraft>(DEFAULT_FEEDBACK_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const authEpochRef = useRef({ token, userId, version: 0 });
  const authSessionEpochRef = useRef({
    hasSession: Boolean(token && userId),
    userId,
    version: 0,
  });
  const previousUserIdRef = useRef(userId);
  const generationOwnerRef = useRef<string | null>(userId);
  const rejectedGenerationIdRef = useRef<string | null>(null);

  if (authEpochRef.current.token !== token || authEpochRef.current.userId !== userId) {
    authEpochRef.current = {
      token,
      userId,
      version: authEpochRef.current.version + 1,
    };
  }
  const authEpoch = authEpochRef.current.version;
  const hasAuthSession = Boolean(token && userId);
  const previousAuthSession = authSessionEpochRef.current;
  if (
    previousAuthSession.userId !== userId ||
    (previousAuthSession.hasSession && !hasAuthSession)
  ) {
    authSessionEpochRef.current = {
      hasSession: hasAuthSession,
      userId,
      version: previousAuthSession.version + 1,
    };
  } else if (previousAuthSession.hasSession !== hasAuthSession) {
    authSessionEpochRef.current = {
      ...previousAuthSession,
      hasSession: hasAuthSession,
    };
  }
  const authSessionEpoch = authSessionEpochRef.current.version;
  const isCurrentAuthEpoch = useCallback((epoch: number) => {
    const current = authEpochRef.current;
    return current.version === epoch && Boolean(current.token) && Boolean(current.userId);
  }, []);
  const isCurrentAuthSessionEpoch = useCallback((epoch: number, ownerUserId: string) => {
    const current = authSessionEpochRef.current;
    return current.version === epoch && current.hasSession && current.userId === ownerUserId;
  }, []);

  const client = useMemo(
    () => createStoryBoredReaderClient(token ? { accessToken: token } : {}),
    [token],
  );
  const passageKey = useMemo(
    () =>
      passage
        ? [passage.bookId, passage.location, passage.selectedText.slice(0, 80)].join('|')
        : '',
    [passage],
  );
  const isActive = generation ? ACTIVE_STATUSES.has(generation.status) : false;
  const canRetry = generation ? RETRYABLE_STATUSES.has(generation.status) : false;
  const imageUrl = generation?.image?.url;

  useEffect(() => {
    const accountChanged = previousUserIdRef.current !== userId;
    previousUserIdRef.current = userId;
    if (!accountChanged && token) return;

    rejectedGenerationIdRef.current = generationId ?? null;
    generationOwnerRef.current = null;
    setGeneration(null);
    setIsSubmitting(false);
    setIsFeedbackSubmitting(false);
    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);
    setError(null);
    clearStoryBoredSceneSession();
    onGenerationChange?.(null);
  }, [generationId, onGenerationChange, token, userId]);

  useEffect(() => {
    if (generationId) return;
    generationOwnerRef.current = null;
    setGeneration(null);
    onGenerationChange?.(null);
    setError(null);
    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);
    setStylePreset(passage?.stylePreset ?? 'cinematic-literary');
  }, [generationId, onGenerationChange, passageKey, passage?.stylePreset]);

  useEffect(() => {
    if (
      !isOpen ||
      !generationId ||
      !token ||
      !userId ||
      rejectedGenerationIdRef.current === generationId
    ) {
      return;
    }

    let cancelled = false;
    const requestAuthEpoch = authEpoch;

    const loadGeneration = async () => {
      try {
        const restoredGeneration = await client.getSceneGeneration(generationId);
        if (cancelled || !isCurrentAuthEpoch(requestAuthEpoch)) return;
        generationOwnerRef.current = userId;
        setGeneration(restoredGeneration);
        onGenerationChange?.(restoredGeneration);
        setError(null);
      } catch (err) {
        if (!cancelled && isCurrentAuthEpoch(requestAuthEpoch)) {
          setError(getErrorMessage(err));
        }
      }
    };

    loadGeneration();

    return () => {
      cancelled = true;
    };
  }, [
    authEpoch,
    client,
    generationId,
    isCurrentAuthEpoch,
    isOpen,
    onGenerationChange,
    token,
    userId,
  ]);

  useEffect(() => {
    if (!passage || !generation || !token || generationOwnerRef.current !== userId) return;

    if (isStoryBoredSceneActive(generation.status)) {
      writeStoryBoredSceneSession({
        bookId: passage.bookId,
        generationId: generation.id,
        generationStatus: generation.status,
        passage,
        updatedAt: Date.now(),
      });
    } else {
      clearStoryBoredSceneSession(generation.id);
    }
  }, [generation, passage, passageKey, token, userId]);

  useEffect(() => {
    if (
      !generation ||
      !token ||
      !userId ||
      generationOwnerRef.current !== userId ||
      !ACTIVE_STATUSES.has(generation.status)
    ) {
      return;
    }

    const requestAuthEpoch = authEpoch;

    const interval = window.setInterval(async () => {
      try {
        const nextGeneration = await client.getSceneGeneration(generation.id);
        if (!isCurrentAuthEpoch(requestAuthEpoch)) return;
        generationOwnerRef.current = userId;
        setGeneration(nextGeneration);
        onGenerationChange?.(nextGeneration);
        setError(null);
      } catch (err) {
        if (isCurrentAuthEpoch(requestAuthEpoch)) {
          setError(getErrorMessage(err));
        }
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [authEpoch, client, generation, isCurrentAuthEpoch, onGenerationChange, token, userId]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!passage || !token || !userId) return;
    const requestAuthSessionEpoch = authSessionEpoch;
    const requestUserId = userId;
    setIsSubmitting(true);
    setError(null);
    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);

    try {
      const nextGeneration = await client.createSceneGeneration({ ...passage, stylePreset });
      if (!isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) return;
      generationOwnerRef.current = requestUserId;
      setGeneration(nextGeneration);
      onGenerationChange?.(nextGeneration);
    } catch (err) {
      if (isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) {
        setIsSubmitting(false);
      }
    }
  };

  const handleCancel = async () => {
    if (!generation || !token || !userId || generationOwnerRef.current !== userId) return;
    const requestAuthSessionEpoch = authSessionEpoch;
    const requestUserId = userId;
    setIsSubmitting(true);
    setError(null);

    try {
      const nextGeneration = await client.cancelSceneGeneration(generation.id);
      if (!isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) return;
      generationOwnerRef.current = requestUserId;
      setGeneration(nextGeneration);
      onGenerationChange?.(nextGeneration);
    } catch (err) {
      if (isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) {
        setIsSubmitting(false);
      }
    }
  };

  const handleRetry = async () => {
    if (!generation || !token || !userId || generationOwnerRef.current !== userId) return;
    const requestAuthSessionEpoch = authSessionEpoch;
    const requestUserId = userId;
    setIsSubmitting(true);
    setError(null);
    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);

    try {
      const nextGeneration = await client.retrySceneGeneration(generation.id);
      if (!isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) return;
      generationOwnerRef.current = requestUserId;
      setGeneration(nextGeneration);
      onGenerationChange?.(nextGeneration);
    } catch (err) {
      if (isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) {
        setIsSubmitting(false);
      }
    }
  };

  const handleFeedbackMatch = (matchedScene: boolean) => {
    setFeedbackDraft((draft) => ({
      ...draft,
      matchedScene,
      rating: matchedScene ? Math.max(draft.rating, 4) : Math.min(draft.rating, 2),
      category:
        matchedScene && !draft.category
          ? 'matched-scene'
          : !matchedScene && (!draft.category || draft.category === 'matched-scene')
            ? 'wrong-scene'
            : draft.category,
    }));
  };

  const handleFeedback = async () => {
    if (
      !generation ||
      !token ||
      !userId ||
      generationOwnerRef.current !== userId ||
      generation.status !== 'completed'
    ) {
      return;
    }
    const feedback = buildStoryBoredFeedbackPayload(feedbackDraft);
    if (!feedback || !isStoryBoredFeedbackDraftReady(feedbackDraft)) return;
    const requestAuthSessionEpoch = authSessionEpoch;
    const requestUserId = userId;

    setIsFeedbackSubmitting(true);
    setError(null);

    try {
      await client.submitFeedback(generation.id, feedback);
      if (!isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) return;
      setFeedbackSubmitted(true);
    } catch (err) {
      if (isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId)) {
        setIsFeedbackSubmitting(false);
      }
    }
  };

  return (
    <aside
      aria-label={_('StoryBored scene panel')}
      className={clsx(
        'bg-base-100 text-base-content border-base-300 fixed z-30 flex flex-col shadow-2xl',
        'inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl border-t',
        'sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[min(420px,calc(100vw-2rem))] sm:rounded-none sm:border-l sm:border-t-0',
      )}
    >
      <header className='border-base-300 flex min-h-14 items-center justify-between gap-3 border-b px-4'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <StoryBoredLogoMarkIcon className='size-8 shrink-0' />
          <div className='min-w-0'>
            <h2 className='truncate text-base font-semibold'>{_('StoryBored')}</h2>
            <p className='text-base-content/60 truncate text-xs'>
              {_(getStatusLabel(generation?.status))}
            </p>
          </div>
        </div>
        <button
          type='button'
          className='btn btn-ghost btn-sm h-10 min-h-10 w-10 p-0'
          aria-label={_('Close')}
          onClick={onClose}
        >
          <X className='size-5' />
        </button>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        <section className='border-base-300 border-b p-4'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <span className='text-base-content/60 text-xs font-semibold uppercase tracking-wide'>
              {_('Passage')}
            </span>
            {passage?.bookTitle && (
              <span className='text-base-content/60 truncate text-xs'>{passage.bookTitle}</span>
            )}
          </div>
          <p className='line-clamp-5 whitespace-pre-wrap text-sm leading-6'>
            {passage?.selectedText || _('No passage selected')}
          </p>
          {passage?.chapter && (
            <p className='text-base-content/60 mt-3 truncate text-xs'>{passage.chapter}</p>
          )}
        </section>

        <section className='border-base-300 border-b p-4'>
          <label className='text-base-content/60 mb-2 block text-xs font-semibold uppercase tracking-wide'>
            {_('Style')}
          </label>
          <select
            className='select select-bordered h-11 min-h-11 w-full text-sm'
            value={stylePreset}
            disabled={isActive || isSubmitting}
            onChange={(event) => setStylePreset(event.target.value as StoryBoredStylePreset)}
          >
            {STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {_(option.label)}
              </option>
            ))}
          </select>
        </section>

        <section aria-live='polite' className='border-base-300 border-b p-4'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <span className='text-base-content/60 text-xs font-semibold uppercase tracking-wide'>
              {_('Scene')}
            </span>
            <span className='bg-base-200 rounded-full px-2.5 py-1 text-xs'>
              {_(getStatusLabel(generation?.status))}
            </span>
          </div>

          {!generation && (
            <div className='border-base-300 text-base-content/60 flex min-h-40 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm'>
              {_('Choose a style and generate a scene.')}
            </div>
          )}

          {generation && !imageUrl && (
            <div className='bg-base-200 flex min-h-40 flex-col items-center justify-center gap-3 rounded-md p-6 text-center'>
              {isActive ? (
                <span className='loading loading-spinner loading-md' aria-hidden='true' />
              ) : (
                <ImagePlus className='text-base-content/50 size-8' />
              )}
              <p className='text-base-content/70 text-sm'>
                {generation.failureReason || _(getStatusLabel(generation.status))}
              </p>
            </div>
          )}

          {imageUrl && (
            <img
              src={imageUrl}
              alt={_('Generated scene')}
              className='aspect-square w-full rounded-md object-cover'
            />
          )}

          {error && <p className='text-error mt-3 text-sm'>{error}</p>}
        </section>

        {generation?.status === 'completed' && (
          <section className='p-4'>
            <span className='text-base-content/60 mb-3 block text-xs font-semibold uppercase tracking-wide'>
              {_('Feedback')}
            </span>
            {feedbackSubmitted ? (
              <p className='text-base-content/70 text-sm'>{_('Feedback saved')}</p>
            ) : (
              <div className='space-y-3'>
                <div className='grid grid-cols-2 gap-2'>
                  <button
                    type='button'
                    className={clsx(
                      'btn h-11 min-h-11',
                      feedbackDraft.matchedScene === true ? 'btn-primary' : 'btn-outline',
                    )}
                    disabled={isFeedbackSubmitting}
                    onClick={() => handleFeedbackMatch(true)}
                  >
                    <ThumbsUp className='size-4' />
                    {_('Matched')}
                  </button>
                  <button
                    type='button'
                    className={clsx(
                      'btn h-11 min-h-11',
                      feedbackDraft.matchedScene === false ? 'btn-primary' : 'btn-outline',
                    )}
                    disabled={isFeedbackSubmitting}
                    onClick={() => handleFeedbackMatch(false)}
                  >
                    <ThumbsDown className='size-4' />
                    {_('Missed')}
                  </button>
                </div>
                <label className='block'>
                  <span className='text-base-content/60 mb-1 block text-xs font-semibold uppercase tracking-wide'>
                    {_('Rating')} {feedbackDraft.rating}/5
                  </span>
                  <input
                    type='range'
                    min='1'
                    max='5'
                    step='1'
                    className='range range-primary range-sm'
                    value={feedbackDraft.rating}
                    disabled={isFeedbackSubmitting}
                    onChange={(event) =>
                      setFeedbackDraft((draft) => ({
                        ...draft,
                        rating: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className='block'>
                  <span className='text-base-content/60 mb-1 block text-xs font-semibold uppercase tracking-wide'>
                    {_('Reason')}
                  </span>
                  <select
                    className='select select-bordered h-11 min-h-11 w-full text-sm'
                    value={feedbackDraft.category}
                    disabled={isFeedbackSubmitting}
                    onChange={(event) =>
                      setFeedbackDraft((draft) => ({
                        ...draft,
                        category: event.target.value as StoryBoredFeedbackDraft['category'],
                      }))
                    }
                  >
                    <option value=''>{_('Choose reason')}</option>
                    {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {_(option.label)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='block'>
                  <span className='text-base-content/60 mb-1 block text-xs font-semibold uppercase tracking-wide'>
                    {_('Notes')}
                  </span>
                  <textarea
                    className='textarea textarea-bordered min-h-20 w-full resize-none text-sm'
                    maxLength={2000}
                    value={feedbackDraft.comment}
                    disabled={isFeedbackSubmitting}
                    onChange={(event) =>
                      setFeedbackDraft((draft) => ({ ...draft, comment: event.target.value }))
                    }
                  />
                </label>
                <button
                  type='button'
                  className='btn btn-primary h-11 min-h-11 w-full'
                  disabled={isFeedbackSubmitting || !isStoryBoredFeedbackDraftReady(feedbackDraft)}
                  onClick={handleFeedback}
                >
                  <Send className='size-4' />
                  {isFeedbackSubmitting ? _('Saving') : _('Save feedback')}
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      <footer className='border-base-300 flex gap-2 border-t p-4'>
        {!generation && (
          <button
            type='button'
            className='btn btn-primary h-11 min-h-11 flex-1'
            disabled={!passage || !token || isSubmitting || !isStoryBoredReaderEnabled()}
            onClick={handleGenerate}
          >
            <ImagePlus className='size-4' />
            {isSubmitting ? _('Generating') : _('Generate')}
          </button>
        )}
        {generation && isActive && (
          <button
            type='button'
            className='btn btn-outline h-11 min-h-11 flex-1'
            disabled={isSubmitting || !token || generationOwnerRef.current !== userId}
            onClick={handleCancel}
          >
            <Ban className='size-4' />
            {_('Cancel')}
          </button>
        )}
        {generation && canRetry && (
          <button
            type='button'
            className='btn btn-primary h-11 min-h-11 flex-1'
            disabled={isSubmitting || !token || generationOwnerRef.current !== userId}
            onClick={handleRetry}
          >
            <RefreshCcw className='size-4' />
            {_('Retry')}
          </button>
        )}
        {generation?.status === 'completed' && (
          <button type='button' className='btn btn-ghost h-11 min-h-11 flex-1' disabled>
            <Star className='size-4' />
            {_('Saved')}
          </button>
        )}
      </footer>
    </aside>
  );
};

export default StoryBoredScenePanel;
