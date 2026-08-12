'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type {
  LearningBoredBoardComprehension,
  LearningBoredClient,
  LearningBoredComprehensionOutcome,
} from './client';
import { useLearningBoredTranslation } from './presentation/context';
import LearningBoredComprehensionState from './work-surface/LearningBoredComprehensionState';

export interface LearningBoredComprehensionPromptProps {
  boardId: string;
  client: LearningBoredClient;
}

const LearningBoredComprehensionPrompt: React.FC<LearningBoredComprehensionPromptProps> = ({
  boardId,
  client,
}) => {
  const _ = useLearningBoredTranslation();
  const translateRef = useRef(_);
  translateRef.current = _;
  const [response, setResponse] = useState<LearningBoredBoardComprehension | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingOutcome, setPendingOutcome] = useState<LearningBoredComprehensionOutcome | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [loadedBoardId, setLoadedBoardId] = useState<string | null>(null);
  const activeBoardIdRef = useRef(boardId);
  const submissionControllerRef = useRef<AbortController | null>(null);
  activeBoardIdRef.current = boardId;

  useEffect(() => {
    const controller = new AbortController();
    submissionControllerRef.current?.abort();
    submissionControllerRef.current = null;
    setResponse(null);
    setPendingOutcome(null);
    setLoadedBoardId(null);
    setLoading(true);
    setError(null);
    void client
      .getBoardComprehension(boardId, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted || activeBoardIdRef.current !== boardId) return;
        setResponse(result);
      })
      .catch((loadError) => {
        if (
          controller.signal.aborted ||
          activeBoardIdRef.current !== boardId ||
          (loadError instanceof Error && loadError.name === 'AbortError')
        ) {
          return;
        }
        setError(translateRef.current('Your answer status could not be loaded. Please try again.'));
      })
      .finally(() => {
        if (!controller.signal.aborted && activeBoardIdRef.current === boardId) {
          setLoadedBoardId(boardId);
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      submissionControllerRef.current?.abort();
      submissionControllerRef.current = null;
    };
  }, [boardId, client, loadRevision]);

  const submit = useCallback(
    async (outcome: LearningBoredComprehensionOutcome) => {
      if (pendingOutcome !== null) return;
      const submittedBoardId = boardId;
      const controller = new AbortController();
      submissionControllerRef.current = controller;
      setPendingOutcome(outcome);
      setError(null);
      try {
        const result = await client.submitBoardComprehension(
          submittedBoardId,
          { outcome },
          { signal: controller.signal },
        );
        if (controller.signal.aborted || activeBoardIdRef.current !== submittedBoardId) return;
        setResponse(result);
      } catch (submitError) {
        if (
          controller.signal.aborted ||
          activeBoardIdRef.current !== submittedBoardId ||
          (submitError instanceof Error && submitError.name === 'AbortError')
        ) {
          return;
        }
        setError(translateRef.current('Your answer could not be saved. Please try again.'));
      } finally {
        if (submissionControllerRef.current === controller) {
          submissionControllerRef.current = null;
          if (activeBoardIdRef.current === submittedBoardId) setPendingOutcome(null);
        }
      }
    },
    [boardId, client, pendingOutcome],
  );

  const currentResponse = response?.boardId === boardId ? response : null;

  if (loading || loadedBoardId !== boardId) {
    return <LearningBoredComprehensionState state={{ kind: 'loading' }} translate={_} />;
  }

  if (error && currentResponse === null) {
    return (
      <LearningBoredComprehensionState
        state={{ kind: 'load-error', message: error }}
        onRetry={() => setLoadRevision((revision) => revision + 1)}
        translate={_}
      />
    );
  }

  if (currentResponse?.status === 'answered') {
    return (
      <LearningBoredComprehensionState
        state={{
          kind: 'answered',
          outcome: currentResponse.outcome ?? 'still_unclear',
        }}
        translate={_}
      />
    );
  }

  return (
    <LearningBoredComprehensionState
      state={{ kind: 'question', pendingOutcome, error }}
      onSubmit={(outcome) => void submit(outcome)}
      translate={_}
    />
  );
};

export default LearningBoredComprehensionPrompt;
