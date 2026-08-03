'use client';

import { Check, MessageCircleQuestion, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import type {
  LearningBoredBoardComprehension,
  LearningBoredClient,
  LearningBoredComprehensionOutcome,
} from './client';

export interface LearningBoredComprehensionPromptProps {
  boardId: string;
  client: LearningBoredClient;
}

const LearningBoredComprehensionPrompt: React.FC<LearningBoredComprehensionPromptProps> = ({
  boardId,
  client,
}) => {
  const _ = useTranslation();
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
    return (
      <section className='border-base-300 border-b p-4' aria-label={_('Comprehension check')}>
        <p className='text-base-content/60 flex items-center gap-2 text-sm' role='status'>
          <span className='loading loading-spinner loading-sm' />{' '}
          {_('Checking your Board response…')}
        </p>
      </section>
    );
  }

  if (error && currentResponse === null) {
    return (
      <section className='border-base-300 border-b p-4' aria-label={_('Comprehension check')}>
        <p className='text-error text-sm' role='alert'>
          {error}
        </p>
        <button
          type='button'
          className='btn btn-outline mt-3 min-h-11'
          onClick={() => setLoadRevision((revision) => revision + 1)}
        >
          <RefreshCw className='size-4' /> {_('Try again')}
        </button>
      </section>
    );
  }

  if (currentResponse?.status === 'answered') {
    return (
      <section className='border-base-300 border-b p-4' aria-label={_('Comprehension check')}>
        <p className='flex items-start gap-2 text-sm leading-6' role='status'>
          <Check className='mt-1 size-4 shrink-0' />
          <span>
            {currentResponse.outcome === 'breakthrough'
              ? _('Thanks — your answer was recorded.')
              : _(
                  'Noted. Try a different Board kind, or select a wider passage — this one may depend on something earlier in the chapter.',
                )}
          </span>
        </p>
      </section>
    );
  }

  return (
    <section
      className='border-base-300 border-b p-4'
      aria-labelledby='learningbored-comprehension-question'
    >
      <div className='flex items-start gap-3'>
        <MessageCircleQuestion className='mt-0.5 size-5 shrink-0' aria-hidden='true' />
        <div>
          <h3 id='learningbored-comprehension-question' className='font-semibold'>
            {_('Did this Board make the passage click?')}
          </h3>
          <p className='text-base-content/60 mt-1 text-sm leading-6'>
            {_('Your answer helps us learn whether the explanation worked.')}
          </p>
        </div>
      </div>
      <div className='mt-3 grid gap-2 sm:grid-cols-2'>
        <button
          type='button'
          className='btn btn-primary min-h-11'
          disabled={pendingOutcome !== null}
          onClick={() => void submit('breakthrough')}
        >
          {pendingOutcome === 'breakthrough' ? _('Saving…') : _('Yes, I understand it')}
        </button>
        <button
          type='button'
          className='btn btn-outline min-h-11'
          disabled={pendingOutcome !== null}
          onClick={() => void submit('still_unclear')}
        >
          {pendingOutcome === 'still_unclear' ? _('Saving…') : _('I still don’t get it')}
        </button>
      </div>
      {error ? (
        <p className='text-error mt-3 text-sm' role='alert'>
          {error}
        </p>
      ) : null}
    </section>
  );
};

export default LearningBoredComprehensionPrompt;
