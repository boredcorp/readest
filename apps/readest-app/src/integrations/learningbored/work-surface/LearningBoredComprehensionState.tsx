'use client';

import { Check, MessageCircleQuestion, RefreshCw } from 'lucide-react';

import type { LearningBoredComprehensionOutcome } from '../client';
import type { LearningBoredTranslationFunc } from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';

import styles from './LearningBoredWorkSurface.module.css';

export type LearningBoredComprehensionViewState =
  | { kind: 'loading' }
  | { kind: 'load-error'; message: string }
  | {
      kind: 'question';
      pendingOutcome: LearningBoredComprehensionOutcome | null;
      error?: string | null;
    }
  | { kind: 'answered'; outcome: LearningBoredComprehensionOutcome };

export interface LearningBoredComprehensionStateProps {
  state: LearningBoredComprehensionViewState;
  onRetry?: () => void;
  onSubmit?: (outcome: LearningBoredComprehensionOutcome) => void;
  translate?: LearningBoredTranslationFunc;
}

export default function LearningBoredComprehensionState({
  state,
  onRetry,
  onSubmit,
  translate = formatLearningBoredCopy,
}: LearningBoredComprehensionStateProps) {
  if (state.kind === 'loading') {
    return (
      <section className={styles['section']} aria-label={translate('Comprehension check')}>
        <p className={styles['muted']} role='status'>
          {translate('Checking your Board response…')}
        </p>
      </section>
    );
  }

  if (state.kind === 'load-error') {
    return (
      <section className={styles['section']} aria-label={translate('Comprehension check')}>
        <p className={styles['error']} role='alert'>
          {state.message}
        </p>
        {onRetry ? (
          <div className={styles['buttonStack']}>
            <button type='button' className={styles['secondaryButton']} onClick={onRetry}>
              <RefreshCw aria-hidden='true' />
              {translate('Try again')}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  if (state.kind === 'answered') {
    return (
      <section className={styles['section']} aria-label={translate('Comprehension check')}>
        <p className={styles['stateRow']} role='status'>
          <Check aria-hidden='true' />
          <span>
            {state.outcome === 'breakthrough'
              ? translate('Thanks — your answer was recorded.')
              : translate(
                  'Noted. Try a different Board kind, or select a wider passage — this one may depend on something earlier in the chapter.',
                )}
          </span>
        </p>
      </section>
    );
  }

  return (
    <section className={styles['section']} aria-labelledby='learningbored-comprehension-question'>
      <div className={styles['stateRow']}>
        <MessageCircleQuestion aria-hidden='true' />
        <div>
          <h3 id='learningbored-comprehension-question' className={styles['stateHeading']}>
            {translate('Did this Board make the passage click?')}
          </h3>
          <p className={styles['stateCopy']}>
            {translate('Your answer helps us learn whether the explanation worked.')}
          </p>
        </div>
      </div>
      <div className={`${styles['buttonGrid']} ${styles['questionActions']}`}>
        <button
          type='button'
          className={styles['primaryButton']}
          disabled={state.pendingOutcome !== null || !onSubmit}
          onClick={() => onSubmit?.('breakthrough')}
        >
          {state.pendingOutcome === 'breakthrough'
            ? translate('Saving…')
            : translate('Yes, I understand it')}
        </button>
        <button
          type='button'
          className={styles['secondaryButton']}
          disabled={state.pendingOutcome !== null || !onSubmit}
          onClick={() => onSubmit?.('still_unclear')}
        >
          {state.pendingOutcome === 'still_unclear'
            ? translate('Saving…')
            : translate('I still don’t get it')}
        </button>
      </div>
      {state.error ? (
        <p className={styles['error']} role='alert'>
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
