'use client';

import { Ban, Clock3, RotateCcw } from 'lucide-react';

import type { LearningBoredTranslationFunc } from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';

import styles from './LearningBoredWorkSurface.module.css';

export type LearningBoredGenerationViewState =
  | { kind: 'ready'; connected: boolean; error?: string | null }
  | {
      kind: 'active';
      label: string;
      error?: string | null;
      canCancel: boolean;
      cancelling?: boolean;
    }
  | { kind: 'failed'; message: string; error?: string | null; retrying?: boolean }
  | { kind: 'cancelled'; error?: string | null; retrying?: boolean }
  | { kind: 'unavailable' };

export interface LearningBoredGenerationStateProps {
  state: LearningBoredGenerationViewState;
  onStart?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  translate?: LearningBoredTranslationFunc;
}

export default function LearningBoredGenerationState({
  state,
  onStart,
  onCancel,
  onRetry,
  translate = formatLearningBoredCopy,
}: LearningBoredGenerationStateProps) {
  if (state.kind === 'ready') {
    return (
      <section className={`${styles['section']} ${styles['centered']}`}>
        <h3 className={styles['stateHeading']}>{translate('Ready to make this passage clear')}</h3>
        <p className={styles['stateCopy']}>
          {state.connected
            ? translate('LearningBored will turn the passage into a grounded visual explanation.')
            : translate('The passage is saved. LearningBored is not connected in this reader yet.')}
        </p>
        {state.error ? (
          <p className={styles['error']} role='alert'>
            {state.error}
          </p>
        ) : null}
        <div className={styles['buttonStack']}>
          <button
            type='button'
            className={`${styles['primaryButton']} ${styles['fullWidth']}`}
            disabled={!state.connected || !onStart}
            onClick={onStart}
          >
            {translate('Board it')}
          </button>
        </div>
      </section>
    );
  }

  if (state.kind === 'active') {
    return (
      <section className={styles['section']} aria-busy='true' aria-live='polite'>
        <div className={styles['stateRow']}>
          <Clock3 aria-hidden='true' />
          <div>
            <h3 className={styles['stateHeading']}>{translate(state.label)}</h3>
            <p className={styles['stateCopy']}>
              {translate(
                'You can close this panel and keep reading. Progress will be here when you return.',
              )}
            </p>
          </div>
        </div>
        {state.error ? (
          <p className={styles['warning']} role='status'>
            {state.error}
          </p>
        ) : null}
        {state.canCancel && onCancel ? (
          <div className={styles['buttonStack']}>
            <button
              type='button'
              className={`${styles['textButton']} ${styles['fullWidth']}`}
              disabled={state.cancelling}
              onClick={onCancel}
            >
              <Ban aria-hidden='true' />
              {state.cancelling ? translate('Cancelling…') : translate('Cancel generation')}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  if (state.kind === 'failed') {
    return (
      <section className={styles['section']} role='alert'>
        <h3 className={styles['stateHeading']}>{translate('Board generation failed')}</h3>
        <p className={styles['stateCopy']}>{translate(state.message)}</p>
        <p className={styles['success']}>{translate('Your Chalk was refunded.')}</p>
        {state.error ? (
          <p className={styles['error']} role='alert'>
            {state.error}
          </p>
        ) : null}
        {onRetry ? (
          <div className={styles['buttonStack']}>
            <button
              type='button'
              className={`${styles['primaryButton']} ${styles['fullWidth']}`}
              disabled={state.retrying}
              onClick={onRetry}
            >
              <RotateCcw aria-hidden='true' />
              {state.retrying ? translate('Retrying…') : translate('Try again')}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  if (state.kind === 'cancelled') {
    return (
      <section className={styles['section']} role='status'>
        <h3 className={styles['stateHeading']}>{translate('Generation cancelled')}</h3>
        <p className={styles['stateCopy']}>
          {translate('Nothing was saved from the incomplete generation. Your Chalk was refunded.')}
        </p>
        {state.error ? (
          <p className={styles['error']} role='alert'>
            {state.error}
          </p>
        ) : null}
        {onRetry ? (
          <div className={styles['buttonStack']}>
            <button
              type='button'
              className={`${styles['primaryButton']} ${styles['fullWidth']}`}
              disabled={state.retrying}
              onClick={onRetry}
            >
              <RotateCcw aria-hidden='true' />
              {state.retrying ? translate('Retrying…') : translate('Start again')}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className={styles['section']} role='alert'>
      <h3 className={styles['stateHeading']}>{translate('The Board is not available yet')}</h3>
      <p className={styles['stateCopy']}>
        {translate(
          'The generation finished, but its result could not be loaded. Try again in a moment.',
        )}
      </p>
    </section>
  );
}
