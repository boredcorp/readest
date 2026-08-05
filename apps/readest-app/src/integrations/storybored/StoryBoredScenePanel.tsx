'use client';

import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  History as HistoryIcon,
  ImageOff,
  ImagePlus,
  RefreshCcw,
  Send,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';

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
  getStoryBoredSceneHistory,
  isStoryBoredSceneImageExpired,
  isStoryBoredSceneImageUrlExpired,
  type StoryBoredSceneHistory,
} from './history';
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
const MAX_CONSECUTIVE_IMAGE_REFRESHES = 2;

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
  bookId?: string;
  passage: StoryBoredPassage | null;
  generationId?: string | null;
  onGenerationChange?: (generation: StoryBoredSceneGeneration | null) => void;
  onHistoryChange?: (hasScenes: boolean, discoveryFailed?: boolean) => void;
  onClose: () => void;
}

const EMPTY_SCENE_HISTORY: StoryBoredSceneHistory = {
  latestActive: null,
  completed: [],
  items: [],
};

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

function clearGenerationAttemptKeys(attempts: Set<string>, generationId: string): void {
  const prefix = `${generationId}:`;
  for (const attempt of attempts) {
    if (attempt.startsWith(prefix)) attempts.delete(attempt);
  }
}

const StoryBoredScenePanel: React.FC<StoryBoredScenePanelProps> = ({
  isOpen,
  bookId,
  passage,
  generationId,
  onGenerationChange,
  onHistoryChange,
  onClose,
}) => {
  const _ = useTranslation();
  const { isReady, token, user } = useAuth();
  const userId = user?.id ?? null;
  const [stylePreset, setStylePreset] = useState<StoryBoredStylePreset>('cinematic-literary');
  const [generation, setGeneration] = useState<StoryBoredSceneGeneration | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackDraft, setFeedbackDraft] =
    useState<StoryBoredFeedbackDraft>(DEFAULT_FEEDBACK_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [sceneHistory, setSceneHistory] = useState<StoryBoredSceneHistory>(EMPTY_SCENE_HISTORY);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [selectingHistoryId, setSelectingHistoryId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [unavailableImageIds, setUnavailableImageIds] = useState<Set<string>>(() => new Set());
  const [unavailableThumbnailIds, setUnavailableThumbnailIds] = useState<Set<string>>(
    () => new Set(),
  );
  const authEpochRef = useRef({ isReady, token, userId, version: 0 });
  const authSessionEpochRef = useRef({
    hasSession: Boolean(isReady && token && userId),
    userId,
    version: 0,
  });
  const resolvedAuthRef = useRef<{ isReady: boolean; userId: string | null }>({
    isReady: false,
    userId: null,
  });
  const generationOwnerRef = useRef<string | null>(userId);
  const generationPassageKeyRef = useRef<string | null>(null);
  const currentGenerationIdRef = useRef<string | null>(generation?.id ?? null);
  currentGenerationIdRef.current = generation?.id ?? null;
  const rejectedGenerationIdRef = useRef<string | null>(null);
  const historyRequestVersionRef = useRef(0);
  const historySelectionVersionRef = useRef(0);
  const imageRefreshAttemptedRef = useRef<Set<string>>(new Set());
  const thumbnailRefreshAttemptedRef = useRef<Set<string>>(new Set());
  const imageRefreshCountRef = useRef<Map<string, number>>(new Map());
  const thumbnailRefreshCountRef = useRef<Map<string, number>>(new Map());

  if (
    authEpochRef.current.isReady !== isReady ||
    authEpochRef.current.token !== token ||
    authEpochRef.current.userId !== userId
  ) {
    authEpochRef.current = {
      isReady,
      token,
      userId,
      version: authEpochRef.current.version + 1,
    };
  }
  const authEpoch = authEpochRef.current.version;
  const hasAuthSession = Boolean(isReady && token && userId);
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
    return (
      current.version === epoch &&
      current.isReady &&
      Boolean(current.token) &&
      Boolean(current.userId)
    );
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
        ? JSON.stringify([
            passage.bookId,
            passage.selectedText,
            passage.surroundingContext,
            passage.chapter,
            passage.location,
          ])
        : '',
    [passage],
  );
  const readerIntentEpochRef = useRef({
    passageKey,
    generationId: generationId ?? null,
    version: 0,
  });
  if (
    readerIntentEpochRef.current.passageKey !== passageKey ||
    readerIntentEpochRef.current.generationId !== (generationId ?? null)
  ) {
    readerIntentEpochRef.current = {
      passageKey,
      generationId: generationId ?? null,
      version: readerIntentEpochRef.current.version + 1,
    };
  }
  const readerIntentEpoch = readerIntentEpochRef.current.version;
  const currentPassageKeyRef = useRef(passageKey);
  currentPassageKeyRef.current = passageKey;
  const resolvedBookId = bookId ?? passage?.bookId ?? null;
  const currentBookIdRef = useRef(resolvedBookId);
  currentBookIdRef.current = resolvedBookId;
  const generationMatchesPassage =
    generationPassageKeyRef.current === null ||
    (Boolean(passage) && generationPassageKeyRef.current === passageKey);
  const visibleGeneration =
    isReady &&
    token &&
    userId &&
    resolvedBookId &&
    generation &&
    generationOwnerRef.current === userId &&
    generationMatchesPassage &&
    generation.bookId === resolvedBookId &&
    (!generationId || generation.id === generationId)
      ? generation
      : null;
  const isActive = visibleGeneration ? ACTIVE_STATUSES.has(visibleGeneration.status) : false;
  const canRetry = visibleGeneration ? RETRYABLE_STATUSES.has(visibleGeneration.status) : false;
  const imageUrl = visibleGeneration?.image?.url;
  const isVisibleImageExpired = Boolean(
    visibleGeneration && isStoryBoredSceneImageExpired(visibleGeneration),
  );
  const isVisibleImageUnavailable = Boolean(
    visibleGeneration && unavailableImageIds.has(visibleGeneration.id),
  );
  const shouldShowVisibleImagePlaceholder = isVisibleImageExpired || isVisibleImageUnavailable;
  const sceneHistoryRef = useRef(sceneHistory);
  sceneHistoryRef.current = sceneHistory;

  const applyScopedGeneration = useCallback(
    (nextGeneration: StoryBoredSceneGeneration, generationPassageKey: string | null) => {
      if (!userId || !resolvedBookId || nextGeneration.bookId !== resolvedBookId) return false;

      rejectedGenerationIdRef.current = null;
      generationOwnerRef.current = userId;
      generationPassageKeyRef.current = generationPassageKey;
      setGeneration(nextGeneration);
      onGenerationChange?.(nextGeneration);
      return true;
    },
    [onGenerationChange, resolvedBookId, userId],
  );

  const mergeHistoryGeneration = useCallback(
    (nextGeneration: StoryBoredSceneGeneration) => {
      if (!resolvedBookId || nextGeneration.bookId !== resolvedBookId) return;

      const nextHistory = getStoryBoredSceneHistory(
        [
          nextGeneration,
          ...sceneHistoryRef.current.items.filter(({ id }) => id !== nextGeneration.id),
        ],
        resolvedBookId,
      );
      sceneHistoryRef.current = nextHistory;
      setSceneHistory(nextHistory);
      onHistoryChange?.(nextHistory.items.length > 0, false);
    },
    [onHistoryChange, resolvedBookId],
  );

  const loadHistory = useCallback(
    async (selectLatest: boolean) => {
      const requestVersion = historyRequestVersionRef.current + 1;
      historyRequestVersionRef.current = requestVersion;
      const requestSelectionVersion = historySelectionVersionRef.current;
      const requestReaderIntentEpoch = readerIntentEpoch;

      if (!isReady || !token || !userId || !resolvedBookId) {
        sceneHistoryRef.current = EMPTY_SCENE_HISTORY;
        setSceneHistory(EMPTY_SCENE_HISTORY);
        setIsHistoryLoading(false);
        setHistoryError(null);
        onHistoryChange?.(false, false);
        return;
      }

      const requestAuthEpoch = authEpoch;
      const requestBookId = resolvedBookId;
      setIsHistoryLoading(true);
      setHistoryError(null);

      try {
        const generations = await client.listBookSceneGenerations(requestBookId);
        if (
          historyRequestVersionRef.current !== requestVersion ||
          !isCurrentAuthEpoch(requestAuthEpoch) ||
          currentBookIdRef.current !== requestBookId
        ) {
          return;
        }

        let nextHistory = getStoryBoredSceneHistory(generations, requestBookId);
        sceneHistoryRef.current = nextHistory;
        setSceneHistory(nextHistory);
        onHistoryChange?.(nextHistory.items.length > 0, false);
        imageRefreshAttemptedRef.current.clear();
        thumbnailRefreshAttemptedRef.current.clear();
        imageRefreshCountRef.current.clear();
        thumbnailRefreshCountRef.current.clear();
        setUnavailableImageIds(new Set());
        setUnavailableThumbnailIds(new Set());

        if (
          !selectLatest ||
          nextHistory.items.length === 0 ||
          (passage !== null && !generationId) ||
          historySelectionVersionRef.current !== requestSelectionVersion ||
          readerIntentEpochRef.current.version !== requestReaderIntentEpoch
        ) {
          return;
        }

        const currentGenerationId = currentGenerationIdRef.current ?? generationId ?? null;
        let selectedGeneration =
          (currentGenerationId
            ? nextHistory.items.find(({ id }) => id === currentGenerationId)
            : null) ??
          nextHistory.latestActive ??
          nextHistory.completed[0] ??
          null;
        if (!selectedGeneration) return;

        if (isStoryBoredSceneImageUrlExpired(selectedGeneration)) {
          const refreshedGeneration = await client.getSceneGeneration(selectedGeneration.id);
          if (
            historyRequestVersionRef.current !== requestVersion ||
            historySelectionVersionRef.current !== requestSelectionVersion ||
            readerIntentEpochRef.current.version !== requestReaderIntentEpoch ||
            !isCurrentAuthEpoch(requestAuthEpoch) ||
            currentBookIdRef.current !== requestBookId ||
            refreshedGeneration.id !== selectedGeneration.id ||
            refreshedGeneration.bookId !== requestBookId
          ) {
            return;
          }

          selectedGeneration = refreshedGeneration;
          nextHistory = getStoryBoredSceneHistory(
            [
              refreshedGeneration,
              ...nextHistory.items.filter(({ id }) => id !== refreshedGeneration.id),
            ],
            requestBookId,
          );
          sceneHistoryRef.current = nextHistory;
          setSceneHistory(nextHistory);
        }

        const preserveHistoryBinding =
          currentGenerationIdRef.current === selectedGeneration.id &&
          generationPassageKeyRef.current === null;
        const generationPassageKey =
          passage && selectedGeneration.id === generationId && !preserveHistoryBinding
            ? passageKey
            : null;
        applyScopedGeneration(selectedGeneration, generationPassageKey);
      } catch (historyLoadError) {
        if (
          historyRequestVersionRef.current === requestVersion &&
          isCurrentAuthEpoch(requestAuthEpoch) &&
          currentBookIdRef.current === requestBookId
        ) {
          setHistoryError(getErrorMessage(historyLoadError));
          onHistoryChange?.(sceneHistoryRef.current.items.length > 0, true);
        }
      } finally {
        if (historyRequestVersionRef.current === requestVersion) {
          setIsHistoryLoading(false);
        }
      }
    },
    [
      applyScopedGeneration,
      authEpoch,
      client,
      generationId,
      isCurrentAuthEpoch,
      isReady,
      onHistoryChange,
      passage,
      passageKey,
      readerIntentEpoch,
      resolvedBookId,
      token,
      userId,
    ],
  );

  useEffect(() => {
    void loadHistory(isOpen);
  }, [isOpen, loadHistory]);

  useEffect(() => {
    if (!isReady) return;

    const previousAuth = resolvedAuthRef.current;
    resolvedAuthRef.current = { isReady: true, userId };
    if (!previousAuth.isReady) return;

    const accountChanged = previousAuth.userId !== userId;
    if (!accountChanged && token) return;

    rejectedGenerationIdRef.current = generationId ?? null;
    generationOwnerRef.current = null;
    generationPassageKeyRef.current = null;
    setGeneration(null);
    setIsSubmitting(false);
    setIsFeedbackSubmitting(false);
    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);
    setError(null);
    clearStoryBoredSceneSession();
    onGenerationChange?.(null);
  }, [generationId, isReady, onGenerationChange, token, userId]);

  useEffect(() => {
    setIsSubmitting(false);
    setIsFeedbackSubmitting(false);
    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);
    setError(null);
  }, [generationId, passageKey]);

  useEffect(() => {
    if (generationId) return;
    rejectedGenerationIdRef.current = null;
    generationOwnerRef.current = null;
    generationPassageKeyRef.current = null;
    setGeneration(null);
    onGenerationChange?.(null);
    setStylePreset(passage?.stylePreset ?? 'cinematic-literary');
  }, [generationId, onGenerationChange, passageKey, passage?.stylePreset]);

  useEffect(() => {
    if (
      !isOpen ||
      !isReady ||
      !generationId ||
      !token ||
      !userId ||
      !resolvedBookId ||
      (generation?.id === generationId &&
        generation.bookId === resolvedBookId &&
        generationOwnerRef.current === userId) ||
      rejectedGenerationIdRef.current === generationId
    ) {
      return;
    }

    let cancelled = false;
    const requestAuthEpoch = authEpoch;
    const requestPassageKey = passage ? currentPassageKeyRef.current : null;
    const requestBookId = resolvedBookId;

    const loadGeneration = async () => {
      try {
        const restoredGeneration = await client.getSceneGeneration(generationId);
        if (
          cancelled ||
          !isCurrentAuthEpoch(requestAuthEpoch) ||
          (requestPassageKey !== null && currentPassageKeyRef.current !== requestPassageKey)
        ) {
          return;
        }
        if (restoredGeneration.id !== generationId || restoredGeneration.bookId !== requestBookId) {
          rejectedGenerationIdRef.current = generationId;
          generationOwnerRef.current = null;
          generationPassageKeyRef.current = null;
          setGeneration(null);
          clearStoryBoredSceneSession(generationId);
          onGenerationChange?.(null);
          return;
        }
        rejectedGenerationIdRef.current = null;
        generationOwnerRef.current = userId;
        generationPassageKeyRef.current = requestPassageKey;
        setGeneration(restoredGeneration);
        onGenerationChange?.(restoredGeneration);
        setError(null);
      } catch (err) {
        if (
          !cancelled &&
          isCurrentAuthEpoch(requestAuthEpoch) &&
          (requestPassageKey === null || currentPassageKeyRef.current === requestPassageKey)
        ) {
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
    generation,
    generationId,
    isCurrentAuthEpoch,
    isReady,
    isOpen,
    onGenerationChange,
    passage,
    resolvedBookId,
    token,
    userId,
  ]);

  useEffect(() => {
    if (
      !isReady ||
      !passage ||
      !generation ||
      !token ||
      !userId ||
      generationOwnerRef.current !== userId
    ) {
      return;
    }

    if (
      !generationId ||
      generation.id !== generationId ||
      generation.bookId !== passage.bookId ||
      generationPassageKeyRef.current !== passageKey
    ) {
      return;
    }

    if (isStoryBoredSceneActive(generation.status) || generation.status === 'completed') {
      writeStoryBoredSceneSession({
        ownerUserId: userId,
        bookId: passage.bookId,
        generationId: generation.id,
        generationStatus: generation.status,
        passage,
        updatedAt: Date.now(),
      });
    } else {
      clearStoryBoredSceneSession(generation.id);
    }
  }, [generation, generationId, isReady, passage, passageKey, token, userId]);

  useEffect(() => {
    if (
      !generation ||
      !isReady ||
      !token ||
      !userId ||
      !resolvedBookId ||
      generationOwnerRef.current !== userId ||
      generation.bookId !== resolvedBookId ||
      (generationId !== null && generationId !== undefined && generation.id !== generationId) ||
      !ACTIVE_STATUSES.has(generation.status)
    ) {
      return;
    }

    const requestAuthEpoch = authEpoch;
    const requestPassageKey = generationPassageKeyRef.current;
    const requestBookId = resolvedBookId;
    let cancelled = false;
    let timeoutId: number | undefined;

    const pollGeneration = async () => {
      let shouldContinue = true;
      try {
        const nextGeneration = await client.getSceneGeneration(generation.id);
        if (
          cancelled ||
          !isCurrentAuthEpoch(requestAuthEpoch) ||
          (requestPassageKey !== null && currentPassageKeyRef.current !== requestPassageKey)
        ) {
          shouldContinue = false;
          return;
        }
        if (nextGeneration.id !== generation.id || nextGeneration.bookId !== requestBookId) {
          shouldContinue = false;
          rejectedGenerationIdRef.current = generation.id;
          generationOwnerRef.current = null;
          generationPassageKeyRef.current = null;
          setGeneration(null);
          clearStoryBoredSceneSession(generation.id);
          onGenerationChange?.(null);
          return;
        }
        generationOwnerRef.current = userId;
        generationPassageKeyRef.current = requestPassageKey;
        setGeneration(nextGeneration);
        onGenerationChange?.(nextGeneration);
        mergeHistoryGeneration(nextGeneration);
        setError(null);
        shouldContinue = ACTIVE_STATUSES.has(nextGeneration.status);
      } catch (err) {
        if (
          !cancelled &&
          isCurrentAuthEpoch(requestAuthEpoch) &&
          (requestPassageKey === null || currentPassageKeyRef.current === requestPassageKey)
        ) {
          setError(getErrorMessage(err));
        } else {
          shouldContinue = false;
        }
      } finally {
        if (
          shouldContinue &&
          !cancelled &&
          isCurrentAuthEpoch(requestAuthEpoch) &&
          (requestPassageKey === null || currentPassageKeyRef.current === requestPassageKey)
        ) {
          timeoutId = window.setTimeout(pollGeneration, 2000);
        }
      }
    };

    timeoutId = window.setTimeout(pollGeneration, 2000);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    authEpoch,
    client,
    generation,
    generationId,
    isCurrentAuthEpoch,
    isReady,
    mergeHistoryGeneration,
    onGenerationChange,
    resolvedBookId,
    token,
    userId,
  ]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!isReady || !passage || !token || !userId) return;
    const requestAuthSessionEpoch = authSessionEpoch;
    const requestUserId = userId;
    const requestPassageKey = passageKey;
    const requestBookId = passage.bookId;
    const requestReaderIntentEpoch = readerIntentEpochRef.current.version;
    const requestSelectionVersion = historySelectionVersionRef.current;
    const requestGenerationId = currentGenerationIdRef.current;
    setIsSubmitting(true);
    setError(null);
    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);

    try {
      const nextGeneration = await client.createSceneGeneration({ ...passage, stylePreset });
      if (
        !isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) ||
        readerIntentEpochRef.current.version !== requestReaderIntentEpoch ||
        historySelectionVersionRef.current !== requestSelectionVersion ||
        currentGenerationIdRef.current !== requestGenerationId ||
        currentPassageKeyRef.current !== requestPassageKey ||
        nextGeneration.bookId !== requestBookId
      ) {
        return;
      }
      rejectedGenerationIdRef.current = null;
      generationOwnerRef.current = requestUserId;
      generationPassageKeyRef.current = requestPassageKey;
      setGeneration(nextGeneration);
      onGenerationChange?.(nextGeneration);
      mergeHistoryGeneration(nextGeneration);
    } catch (err) {
      if (
        isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) &&
        readerIntentEpochRef.current.version === requestReaderIntentEpoch &&
        historySelectionVersionRef.current === requestSelectionVersion &&
        currentGenerationIdRef.current === requestGenerationId &&
        currentPassageKeyRef.current === requestPassageKey
      ) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (
        isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) &&
        readerIntentEpochRef.current.version === requestReaderIntentEpoch &&
        historySelectionVersionRef.current === requestSelectionVersion &&
        currentGenerationIdRef.current === requestGenerationId &&
        currentPassageKeyRef.current === requestPassageKey
      ) {
        setIsSubmitting(false);
      }
    }
  };

  const handleCancel = async () => {
    if (
      !isReady ||
      !generation ||
      !token ||
      !userId ||
      !resolvedBookId ||
      generationOwnerRef.current !== userId ||
      generation.bookId !== resolvedBookId
    ) {
      return;
    }
    const requestAuthSessionEpoch = authSessionEpoch;
    const requestUserId = userId;
    const requestPassageKey = generationPassageKeyRef.current;
    const requestBookId = resolvedBookId;
    const requestReaderIntentEpoch = readerIntentEpochRef.current.version;
    const requestSelectionVersion = historySelectionVersionRef.current;
    const requestGenerationId = generation.id;
    setIsSubmitting(true);
    setError(null);

    try {
      const nextGeneration = await client.cancelSceneGeneration(generation.id);
      if (
        !isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) ||
        readerIntentEpochRef.current.version !== requestReaderIntentEpoch ||
        historySelectionVersionRef.current !== requestSelectionVersion ||
        currentGenerationIdRef.current !== requestGenerationId ||
        (requestPassageKey !== null && currentPassageKeyRef.current !== requestPassageKey) ||
        nextGeneration.id !== generation.id ||
        nextGeneration.bookId !== requestBookId
      ) {
        return;
      }
      generationOwnerRef.current = requestUserId;
      generationPassageKeyRef.current = requestPassageKey;
      setGeneration(nextGeneration);
      onGenerationChange?.(nextGeneration);
      mergeHistoryGeneration(nextGeneration);
    } catch (err) {
      if (
        isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) &&
        readerIntentEpochRef.current.version === requestReaderIntentEpoch &&
        historySelectionVersionRef.current === requestSelectionVersion &&
        currentGenerationIdRef.current === requestGenerationId &&
        (requestPassageKey === null || currentPassageKeyRef.current === requestPassageKey)
      ) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (
        isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) &&
        readerIntentEpochRef.current.version === requestReaderIntentEpoch &&
        historySelectionVersionRef.current === requestSelectionVersion &&
        currentGenerationIdRef.current === requestGenerationId &&
        (requestPassageKey === null || currentPassageKeyRef.current === requestPassageKey)
      ) {
        setIsSubmitting(false);
      }
    }
  };

  const handleRetry = async () => {
    if (
      !isReady ||
      !generation ||
      !token ||
      !userId ||
      !resolvedBookId ||
      generationOwnerRef.current !== userId ||
      generation.bookId !== resolvedBookId
    ) {
      return;
    }
    const requestAuthSessionEpoch = authSessionEpoch;
    const requestUserId = userId;
    const requestPassageKey = generationPassageKeyRef.current;
    const requestBookId = resolvedBookId;
    const requestReaderIntentEpoch = readerIntentEpochRef.current.version;
    const requestSelectionVersion = historySelectionVersionRef.current;
    const requestGenerationId = generation.id;
    setIsSubmitting(true);
    setError(null);
    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);

    try {
      const nextGeneration = await client.retrySceneGeneration(generation.id);
      if (
        !isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) ||
        readerIntentEpochRef.current.version !== requestReaderIntentEpoch ||
        historySelectionVersionRef.current !== requestSelectionVersion ||
        currentGenerationIdRef.current !== requestGenerationId ||
        (requestPassageKey !== null && currentPassageKeyRef.current !== requestPassageKey) ||
        nextGeneration.id !== generation.id ||
        nextGeneration.bookId !== requestBookId
      ) {
        return;
      }
      generationOwnerRef.current = requestUserId;
      generationPassageKeyRef.current = requestPassageKey;
      setGeneration(nextGeneration);
      onGenerationChange?.(nextGeneration);
      mergeHistoryGeneration(nextGeneration);
    } catch (err) {
      if (
        isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) &&
        readerIntentEpochRef.current.version === requestReaderIntentEpoch &&
        historySelectionVersionRef.current === requestSelectionVersion &&
        currentGenerationIdRef.current === requestGenerationId &&
        (requestPassageKey === null || currentPassageKeyRef.current === requestPassageKey)
      ) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (
        isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) &&
        readerIntentEpochRef.current.version === requestReaderIntentEpoch &&
        historySelectionVersionRef.current === requestSelectionVersion &&
        currentGenerationIdRef.current === requestGenerationId &&
        (requestPassageKey === null || currentPassageKeyRef.current === requestPassageKey)
      ) {
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
      !isReady ||
      !token ||
      !userId ||
      !resolvedBookId ||
      generationOwnerRef.current !== userId ||
      generation.bookId !== resolvedBookId ||
      generation.status !== 'completed'
    ) {
      return;
    }
    const feedback = buildStoryBoredFeedbackPayload(feedbackDraft);
    if (!feedback || !isStoryBoredFeedbackDraftReady(feedbackDraft)) return;
    const requestAuthSessionEpoch = authSessionEpoch;
    const requestUserId = userId;
    const requestPassageKey = generationPassageKeyRef.current;
    const requestGenerationId = generation.id;
    const isCurrentFeedbackScope = () =>
      isCurrentAuthSessionEpoch(requestAuthSessionEpoch, requestUserId) &&
      (requestPassageKey === null || currentPassageKeyRef.current === requestPassageKey) &&
      currentGenerationIdRef.current === requestGenerationId &&
      generationOwnerRef.current === requestUserId;

    setIsFeedbackSubmitting(true);
    setError(null);

    try {
      await client.submitFeedback(generation.id, feedback);
      if (!isCurrentFeedbackScope()) return;
      setFeedbackSubmitted(true);
    } catch (err) {
      if (isCurrentFeedbackScope()) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (isCurrentFeedbackScope()) {
        setIsFeedbackSubmitting(false);
      }
    }
  };

  const handleSelectHistoryGeneration = async (historyGeneration: StoryBoredSceneGeneration) => {
    if (!isReady || !token || !userId || !resolvedBookId) return;
    const requestVersion = historySelectionVersionRef.current + 1;
    historySelectionVersionRef.current = requestVersion;
    const requestAuthEpoch = authEpoch;
    const requestReaderIntentEpoch = readerIntentEpochRef.current.version;
    const requestBookId = resolvedBookId;
    let selectedGeneration = historyGeneration;

    setFeedbackSubmitted(false);
    setFeedbackDraft(DEFAULT_FEEDBACK_DRAFT);
    setError(null);
    setSelectingHistoryId(historyGeneration.id);

    try {
      if (
        unavailableImageIds.has(selectedGeneration.id) ||
        isStoryBoredSceneImageUrlExpired(selectedGeneration)
      ) {
        selectedGeneration = await client.getSceneGeneration(selectedGeneration.id);
      }

      if (
        historySelectionVersionRef.current !== requestVersion ||
        readerIntentEpochRef.current.version !== requestReaderIntentEpoch ||
        !isCurrentAuthEpoch(requestAuthEpoch) ||
        currentBookIdRef.current !== requestBookId ||
        selectedGeneration.id !== historyGeneration.id ||
        selectedGeneration.bookId !== requestBookId
      ) {
        return;
      }

      if (selectedGeneration.image) {
        setUnavailableImageIds((current) => {
          if (!current.has(selectedGeneration.id)) return current;
          const next = new Set(current);
          next.delete(selectedGeneration.id);
          return next;
        });
      }
      applyScopedGeneration(selectedGeneration, null);
      mergeHistoryGeneration(selectedGeneration);
    } catch (historySelectionError) {
      if (
        historySelectionVersionRef.current === requestVersion &&
        readerIntentEpochRef.current.version === requestReaderIntentEpoch &&
        isCurrentAuthEpoch(requestAuthEpoch) &&
        currentBookIdRef.current === requestBookId
      ) {
        setError(getErrorMessage(historySelectionError));
      }
    } finally {
      if (historySelectionVersionRef.current === requestVersion) {
        setSelectingHistoryId(null);
      }
    }
  };

  const handleVisibleImageError = async () => {
    if (!visibleGeneration || !isReady || !token || !userId || !resolvedBookId) return;
    const failedImageUrl = visibleGeneration.image?.url;
    if (!failedImageUrl) return;
    const refreshAttemptKey = `${visibleGeneration.id}:${failedImageUrl}`;
    const refreshCount = imageRefreshCountRef.current.get(visibleGeneration.id) ?? 0;

    if (
      refreshCount >= MAX_CONSECUTIVE_IMAGE_REFRESHES ||
      imageRefreshAttemptedRef.current.has(refreshAttemptKey)
    ) {
      setUnavailableImageIds((current) => new Set(current).add(visibleGeneration.id));
      return;
    }

    imageRefreshAttemptedRef.current.add(refreshAttemptKey);
    imageRefreshCountRef.current.set(visibleGeneration.id, refreshCount + 1);
    const requestAuthEpoch = authEpoch;
    const requestGenerationId = visibleGeneration.id;
    const requestBookId = resolvedBookId;
    const requestPassageKey = generationPassageKeyRef.current;
    const requestReaderIntentEpoch = readerIntentEpochRef.current.version;
    const requestSelectionVersion = historySelectionVersionRef.current;

    try {
      const refreshedGeneration = await client.getSceneGeneration(requestGenerationId);
      if (
        !isCurrentAuthEpoch(requestAuthEpoch) ||
        readerIntentEpochRef.current.version !== requestReaderIntentEpoch ||
        historySelectionVersionRef.current !== requestSelectionVersion ||
        currentGenerationIdRef.current !== requestGenerationId ||
        currentBookIdRef.current !== requestBookId ||
        refreshedGeneration.id !== requestGenerationId ||
        refreshedGeneration.bookId !== requestBookId
      ) {
        return;
      }

      if (!refreshedGeneration.image) {
        setUnavailableImageIds((current) => {
          if (!current.has(requestGenerationId)) return current;
          const next = new Set(current);
          next.delete(requestGenerationId);
          return next;
        });
      } else if (refreshedGeneration.image.url === failedImageUrl) {
        setUnavailableImageIds((current) => new Set(current).add(requestGenerationId));
      } else {
        setUnavailableImageIds((current) => {
          if (!current.has(requestGenerationId)) return current;
          const next = new Set(current);
          next.delete(requestGenerationId);
          return next;
        });
      }
      applyScopedGeneration(refreshedGeneration, requestPassageKey);
      mergeHistoryGeneration(refreshedGeneration);
    } catch (imageRefreshError) {
      if (
        isCurrentAuthEpoch(requestAuthEpoch) &&
        readerIntentEpochRef.current.version === requestReaderIntentEpoch &&
        historySelectionVersionRef.current === requestSelectionVersion &&
        currentGenerationIdRef.current === requestGenerationId &&
        currentBookIdRef.current === requestBookId
      ) {
        setUnavailableImageIds((current) => new Set(current).add(requestGenerationId));
        setError(getErrorMessage(imageRefreshError));
      }
    }
  };

  const handleVisibleImageLoad = (generationIdToReset: string) => {
    imageRefreshCountRef.current.delete(generationIdToReset);
    clearGenerationAttemptKeys(imageRefreshAttemptedRef.current, generationIdToReset);
    setUnavailableImageIds((current) => {
      if (!current.has(generationIdToReset)) return current;
      const next = new Set(current);
      next.delete(generationIdToReset);
      return next;
    });
  };

  const handleHistoryThumbnailError = async (
    historyGeneration: StoryBoredSceneGeneration,
    failedThumbnailUrl: string,
  ) => {
    if (!isReady || !token || !userId || !resolvedBookId) return;
    const refreshAttemptKey = `${historyGeneration.id}:${failedThumbnailUrl}`;
    const refreshCount = thumbnailRefreshCountRef.current.get(historyGeneration.id) ?? 0;

    if (
      refreshCount >= MAX_CONSECUTIVE_IMAGE_REFRESHES ||
      thumbnailRefreshAttemptedRef.current.has(refreshAttemptKey)
    ) {
      setUnavailableThumbnailIds((current) => new Set(current).add(historyGeneration.id));
      return;
    }

    thumbnailRefreshAttemptedRef.current.add(refreshAttemptKey);
    thumbnailRefreshCountRef.current.set(historyGeneration.id, refreshCount + 1);
    const requestAuthEpoch = authEpoch;
    const requestBookId = resolvedBookId;

    try {
      const refreshedGeneration = await client.getSceneGeneration(historyGeneration.id);
      if (
        !isCurrentAuthEpoch(requestAuthEpoch) ||
        currentBookIdRef.current !== requestBookId ||
        refreshedGeneration.id !== historyGeneration.id ||
        refreshedGeneration.bookId !== requestBookId
      ) {
        return;
      }

      const refreshedThumbnailUrl =
        refreshedGeneration.image?.thumbnailUrl ?? refreshedGeneration.image?.url;
      if (refreshedGeneration.image && refreshedThumbnailUrl !== failedThumbnailUrl) {
        setUnavailableThumbnailIds((current) => {
          if (!current.has(historyGeneration.id)) return current;
          const next = new Set(current);
          next.delete(historyGeneration.id);
          return next;
        });
      } else if (refreshedGeneration.image) {
        setUnavailableThumbnailIds((current) => new Set(current).add(historyGeneration.id));
      }
      mergeHistoryGeneration(refreshedGeneration);
    } catch (thumbnailRefreshError) {
      if (isCurrentAuthEpoch(requestAuthEpoch) && currentBookIdRef.current === requestBookId) {
        setUnavailableThumbnailIds((current) => new Set(current).add(historyGeneration.id));
        setHistoryError(getErrorMessage(thumbnailRefreshError));
      }
    }
  };

  const handleHistoryThumbnailLoad = (generationIdToReset: string) => {
    thumbnailRefreshCountRef.current.delete(generationIdToReset);
    clearGenerationAttemptKeys(thumbnailRefreshAttemptedRef.current, generationIdToReset);
    setUnavailableThumbnailIds((current) => {
      if (!current.has(generationIdToReset)) return current;
      const next = new Set(current);
      next.delete(generationIdToReset);
      return next;
    });
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
              {_(getStatusLabel(visibleGeneration?.status))}
            </p>
          </div>
        </div>
        <div className='flex items-center gap-1'>
          <button
            type='button'
            className='btn btn-ghost btn-sm h-10 min-h-10 w-10 p-0'
            aria-label={_('Refresh scene history')}
            disabled={isHistoryLoading || !resolvedBookId || !token}
            onClick={() => void loadHistory(true)}
          >
            <RefreshCcw className={clsx('size-4', isHistoryLoading && 'animate-spin')} />
          </button>
          <button
            type='button'
            className='btn btn-ghost btn-sm h-10 min-h-10 w-10 p-0'
            aria-label={_('Close')}
            onClick={onClose}
          >
            <X className='size-5' />
          </button>
        </div>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        <section
          aria-label={_('Scene history')}
          aria-busy={isHistoryLoading}
          className='border-base-300 border-b p-4'
        >
          <div className='mb-3 flex items-center justify-between gap-3'>
            <span className='text-base-content/60 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide'>
              <HistoryIcon className='size-3.5' />
              {_('History')}
            </span>
            {sceneHistory.completed.length > 0 && (
              <span className='text-base-content/50 text-xs'>
                {sceneHistory.completed.length}/20
              </span>
            )}
          </div>

          {isHistoryLoading && sceneHistory.items.length === 0 && (
            <div role='status' className='text-base-content/60 flex items-center gap-2 text-sm'>
              <span className='loading loading-spinner loading-xs' aria-hidden='true' />
              {_('Loading saved scenes')}
            </div>
          )}

          {!isHistoryLoading && sceneHistory.items.length === 0 && !historyError && (
            <p className='text-base-content/60 text-sm'>{_('No saved scenes yet')}</p>
          )}

          {historyError && (
            <p role='alert' className='text-error text-sm'>
              {historyError}
            </p>
          )}

          {sceneHistory.items.length > 0 && (
            <div className='space-y-2'>
              {sceneHistory.items.map((historyGeneration) => {
                const historyImageUrl =
                  historyGeneration.image?.thumbnailUrl ?? historyGeneration.image?.url;
                const historyImageExpired = isStoryBoredSceneImageExpired(historyGeneration);
                const historyImageUnavailable = unavailableThumbnailIds.has(historyGeneration.id);
                const isSelected = visibleGeneration?.id === historyGeneration.id;

                return (
                  <button
                    key={historyGeneration.id}
                    type='button'
                    className={clsx(
                      'border-base-300 hover:bg-base-200/70 flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors',
                      isSelected && 'border-primary bg-primary/10',
                    )}
                    aria-pressed={isSelected}
                    aria-busy={selectingHistoryId === historyGeneration.id}
                    disabled={selectingHistoryId !== null || isSubmitting}
                    aria-label={`${_('Open saved scene')}: ${historyGeneration.selectedTextPreview ?? _(getStatusLabel(historyGeneration.status))}`}
                    onClick={() => void handleSelectHistoryGeneration(historyGeneration)}
                  >
                    <span className='bg-base-200 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md'>
                      {historyImageUrl && !historyImageExpired && !historyImageUnavailable ? (
                        <img
                          src={historyImageUrl}
                          alt=''
                          className='size-full object-cover'
                          loading='lazy'
                          onLoad={() => handleHistoryThumbnailLoad(historyGeneration.id)}
                          onError={() =>
                            void handleHistoryThumbnailError(historyGeneration, historyImageUrl)
                          }
                        />
                      ) : historyImageExpired || historyImageUnavailable ? (
                        <ImageOff className='text-base-content/40 size-5' />
                      ) : (
                        <span className='loading loading-spinner loading-sm' aria-hidden='true' />
                      )}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm font-medium'>
                        {historyGeneration.selectedTextPreview ?? _('Saved scene')}
                      </span>
                      <span className='text-base-content/60 mt-0.5 block text-xs'>
                        {historyImageExpired
                          ? _('Expired')
                          : historyImageUnavailable
                            ? _('Preview unavailable')
                            : _(getStatusLabel(historyGeneration.status))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

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
            {generationPassageKeyRef.current === null && visibleGeneration?.selectedTextPreview
              ? visibleGeneration.selectedTextPreview
              : passage?.selectedText || _('No passage selected')}
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
            disabled={!passage || isActive || isSubmitting}
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
              {_(getStatusLabel(visibleGeneration?.status))}
            </span>
          </div>

          {!visibleGeneration && (
            <div className='border-base-300 text-base-content/60 flex min-h-40 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm'>
              {_('Choose a style and generate a scene.')}
            </div>
          )}

          {visibleGeneration && (!imageUrl || shouldShowVisibleImagePlaceholder) && (
            <div className='bg-base-200 flex min-h-40 flex-col items-center justify-center gap-3 rounded-md p-6 text-center'>
              {isActive ? (
                <span className='loading loading-spinner loading-md' aria-hidden='true' />
              ) : shouldShowVisibleImagePlaceholder ? (
                <ImageOff className='text-base-content/50 size-8' />
              ) : (
                <ImagePlus className='text-base-content/50 size-8' />
              )}
              <p className='text-base-content/70 text-sm'>
                {isVisibleImageExpired
                  ? _('Scene image expired')
                  : isVisibleImageUnavailable
                    ? _('Scene image unavailable')
                    : visibleGeneration.failureReason ||
                      _(getStatusLabel(visibleGeneration.status))}
              </p>
            </div>
          )}

          {imageUrl && !shouldShowVisibleImagePlaceholder && (
            <img
              src={imageUrl}
              alt={_('Generated scene')}
              className='aspect-square w-full rounded-md object-cover'
              onLoad={() => handleVisibleImageLoad(visibleGeneration.id)}
              onError={() => void handleVisibleImageError()}
            />
          )}

          {error && <p className='text-error mt-3 text-sm'>{error}</p>}
        </section>

        {visibleGeneration?.status === 'completed' && (
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
        {!visibleGeneration && (
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
        {visibleGeneration && isActive && (
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
        {visibleGeneration && canRetry && (
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
        {visibleGeneration?.status === 'completed' && (
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
