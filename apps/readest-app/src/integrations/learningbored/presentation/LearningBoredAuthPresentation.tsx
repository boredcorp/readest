'use client';

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from 'react';
import { useId } from 'react';

import {
  type LearningBoredPresentationTheme,
  useLearningBoredPresentationTheme,
  useLearningBoredTranslation,
} from './context';
import { learningBoredDirectionContractAttributes } from './direction-contract';
import LearningBoredBrandMark from './LearningBoredBrandMark';
import styles from './LearningBoredAuthPresentation.module.css';

interface LearningBoredAuthPresentationProps extends PropsWithChildren {
  backLabel?: string;
  description?: ReactNode;
  heading?: ReactNode;
  onBack?: () => void;
  privacyNote?: ReactNode;
  theme?: LearningBoredPresentationTheme;
  windowControls?: ReactNode;
}

type LearningBoredAuthStatusTone = 'pending' | 'success' | 'error';

interface LearningBoredAuthStatusProps extends PropsWithChildren {
  actions?: ReactNode;
  title: ReactNode;
  tone?: LearningBoredAuthStatusTone;
}

interface LearningBoredAuthActionsProps extends PropsWithChildren {
  align?: 'start' | 'stretch';
}

interface LearningBoredAuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'text';
}

interface LearningBoredAuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  hint?: ReactNode;
  id: string;
  label: ReactNode;
}

interface LearningBoredAuthMessageProps extends PropsWithChildren {
  tone?: 'success' | 'error' | 'neutral';
}

function BackIcon() {
  return (
    <svg aria-hidden='true' viewBox='0 0 20 20'>
      <path d='m11.75 4.25-5.5 5.5 5.5 5.5M6.5 9.75h7.25' />
    </svg>
  );
}

function StatusIcon({ tone }: { tone: LearningBoredAuthStatusTone }) {
  if (tone === 'success') {
    return (
      <svg aria-hidden='true' viewBox='0 0 24 24'>
        <path d='m5.5 12.5 4 4 9-10' />
      </svg>
    );
  }

  if (tone === 'error') {
    return (
      <svg aria-hidden='true' viewBox='0 0 24 24'>
        <path d='m7 7 10 10M17 7 7 17' />
      </svg>
    );
  }

  return (
    <svg aria-hidden='true' viewBox='0 0 24 24'>
      <path d='M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8' />
    </svg>
  );
}

export function LearningBoredAuthStatus({
  actions,
  children,
  title,
  tone = 'pending',
}: LearningBoredAuthStatusProps) {
  const statusId = useId();
  const titleId = `${statusId}-title`;
  const copyId = `${statusId}-copy`;

  return (
    <div
      aria-describedby={copyId}
      aria-labelledby={titleId}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`${styles['taskStatus']} ${styles[`taskStatus-${tone}`]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className={`${styles['statusIcon']} ${styles[`statusIcon-${tone}`]}`}>
        <StatusIcon tone={tone} />
      </span>
      <div className={styles['statusBody']}>
        <h2 id={titleId}>{title}</h2>
        <div className={styles['statusCopy']} id={copyId}>
          {children}
        </div>
        {actions && <div className={styles['statusActions']}>{actions}</div>}
      </div>
    </div>
  );
}

export function LearningBoredAuthActions({
  align = 'stretch',
  children,
}: LearningBoredAuthActionsProps) {
  return (
    <div className={styles['authActions']} data-align={align}>
      {children}
    </div>
  );
}

export function LearningBoredAuthButton({
  className,
  variant = 'primary',
  ...props
}: LearningBoredAuthButtonProps) {
  return (
    <button
      className={`${styles['authButton']} ${styles[`authButton-${variant}`]}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}

export function LearningBoredAuthField({ hint, id, label, ...props }: LearningBoredAuthFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={styles['authField']}>
      <label htmlFor={id}>{label}</label>
      <input aria-describedby={hintId} id={id} {...props} />
      {hint && <p id={hintId}>{hint}</p>}
    </div>
  );
}

export function LearningBoredAuthMessage({
  children,
  tone = 'neutral',
}: LearningBoredAuthMessageProps) {
  return (
    <div
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`${styles['authMessage']} ${styles[`authMessage-${tone}`]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export default function LearningBoredAuthPresentation({
  backLabel,
  children,
  description,
  heading,
  onBack,
  privacyNote,
  theme,
  windowControls,
}: LearningBoredAuthPresentationProps) {
  const _ = useLearningBoredTranslation();
  const presentationTheme = useLearningBoredPresentationTheme();
  const resolvedBackLabel = backLabel ?? _('Go Back');

  return (
    <main
      {...learningBoredDirectionContractAttributes}
      className={`lb-presentation ${styles['surface']}`}
      data-lb-presentation='auth'
      data-lb-theme={theme ?? presentationTheme}
    >
      {onBack && (
        <button
          aria-label={resolvedBackLabel}
          className={styles['backControl']}
          onClick={onBack}
          type='button'
        >
          <BackIcon />
          <span>{resolvedBackLabel}</span>
        </button>
      )}

      {windowControls && <div className={styles['windowControls']}>{windowControls}</div>}

      <section className={styles['taskPlane']} aria-labelledby='learningbored-auth-heading'>
        <div className={styles['taskFrame']}>
          <header className={styles['taskHeader']}>
            <h1 id='learningbored-auth-heading'>{heading ?? _('Sign in to continue.')}</h1>
            <p>
              {description ?? _('Use the email address connected to your private-beta invitation.')}
            </p>
          </header>

          <div className={styles['authForm']}>{children}</div>

          <p className={styles['privacyNote']}>
            {privacyNote ??
              _(
                'Signing in does not create a new account. Your library, Boards, and review history stay private to your account.',
              )}
          </p>
        </div>
      </section>

      <aside className={styles['contextRail']} aria-label={_('Your LearningBored workspace')}>
        <div className={styles['brandLockup']}>
          <div className={styles['brand']}>
            <LearningBoredBrandMark className={styles['brandMark']} />
            <span>LearningBored</span>
          </div>
          <span className={styles['betaStatus']}>{_('Private beta')}</span>
        </div>

        <div className={styles['contextCopy']}>
          <h2>{_('Your reading work stays together.')}</h2>
          <p>
            {_(
              'Return to the books you imported, the Boards you made, and the questions ready for review.',
            )}
          </p>
        </div>

        <dl className={styles['resumeLedger']}>
          <div>
            <dt>{_('Library')}</dt>
            <dd>{_('Your imported books')}</dd>
          </div>
          <div>
            <dt>{_('Boards')}</dt>
            <dd>{_('Grounded explanations')}</dd>
          </div>
          <div>
            <dt>{_('Review')}</dt>
            <dd>{_('What is ready today')}</dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}
