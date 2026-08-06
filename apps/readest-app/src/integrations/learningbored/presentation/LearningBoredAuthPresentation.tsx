'use client';

import type { PropsWithChildren, ReactNode } from 'react';

import { useTranslation } from '@/hooks/useTranslation';

import LearningBoredFoldMark from './LearningBoredFoldMark';
import { type LearningBoredPresentationTheme, useLearningBoredPresentationTheme } from './theme';
import styles from './LearningBoredAuthPresentation.module.css';

interface LearningBoredAuthPresentationProps extends PropsWithChildren {
  backLabel?: string;
  onBack?: () => void;
  theme?: LearningBoredPresentationTheme;
  windowControls?: ReactNode;
}

function BackIcon() {
  return (
    <svg aria-hidden='true' viewBox='0 0 20 20'>
      <path d='m11.75 4.25-5.5 5.5 5.5 5.5M6.5 9.75h7.25' />
    </svg>
  );
}

export default function LearningBoredAuthPresentation({
  backLabel,
  children,
  onBack,
  theme,
  windowControls,
}: LearningBoredAuthPresentationProps) {
  const _ = useTranslation();
  const presentationTheme = useLearningBoredPresentationTheme();
  const resolvedBackLabel = backLabel ?? _('Go Back');

  return (
    <main
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
            <h1 id='learningbored-auth-heading'>{_('Sign in to continue.')}</h1>
            <p>{_('Use the email address connected to your private-beta invitation.')}</p>
          </header>

          <div className={styles['authForm']}>{children}</div>

          <p className={styles['privacyNote']}>
            {_(
              'Signing in does not create a new account. Your library, Boards, and review history stay private to your account.',
            )}
          </p>
        </div>
      </section>

      <aside className={styles['contextRail']} aria-label={_('Your LearningBored workspace')}>
        <div className={styles['brandLockup']}>
          <div className={styles['brand']}>
            <LearningBoredFoldMark className={styles['foldMark']} />
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
