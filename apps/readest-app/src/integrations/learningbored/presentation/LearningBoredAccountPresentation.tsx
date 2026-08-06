'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import ProfileHeader from '@/app/user/components/Header';
import { useTranslation } from '@/hooks/useTranslation';
import { useLearningBoredClient } from '@/integrations/learningbored/LearningBoredClientContext';
import { LEARNINGBORED_SUPPORT_EMAIL } from '@/integrations/learningbored/private-beta-policy';
import type {
  LearningBoredCreditLedgerEntry,
  LearningBoredCredits,
} from '@/integrations/learningbored/client';

import { useLearningBoredPresentationTheme } from './theme';
import styles from './learningbored-account.module.css';

type CreditsState =
  | { status: 'loading' }
  | { status: 'ready'; credits: LearningBoredCredits }
  | { status: 'error' };

export interface LearningBoredAccountPresentationProps {
  status: 'loading' | 'ready';
  userFullName?: string;
  userEmail?: string;
  safeAreaTop?: number;
  roundedWindow?: boolean;
  storageOpen?: boolean;
  storageContent?: ReactNode;
  onBack: () => void;
  onToggleStorage: () => void;
  onResetPassword: () => void;
  onUpdateEmail: () => void;
  onSignOut: () => void;
}

function accountInitials(name: string | undefined, email: string | undefined): string {
  const parts = name?.trim().split(/\s+/u).filter(Boolean).slice(0, 2);
  if (parts && parts.length > 0) {
    return parts.map((part) => part[0]?.toUpperCase()).join('');
  }
  return email?.trim().slice(0, 1).toUpperCase() || 'L';
}

function eventCopy(
  event: LearningBoredCreditLedgerEntry,
  translate: ReturnType<typeof useTranslation>,
): { label: string; detail: string } {
  switch (event.eventType) {
    case 'chalk_granted':
      return {
        label: translate('Chalk added'),
        detail: translate('Added to your available balance.'),
      };
    case 'chalk_reserved':
      return {
        label: translate('Chalk reserved'),
        detail: translate('Held while a Board is being made.'),
      };
    case 'chalk_committed':
      return {
        label: translate('Chalk spent'),
        detail: translate('Committed after a Board completed.'),
      };
    case 'chalk_released':
      return {
        label: translate('Chalk released'),
        detail: translate('Returned after work stopped.'),
      };
    default:
      return {
        label: translate('Chalk balance updated'),
        detail: translate('Your Chalk ledger recorded an account change.'),
      };
  }
}

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function CreditHistory({ entries }: { entries: LearningBoredCreditLedgerEntry[] }) {
  const _ = useTranslation();

  if (entries.length === 0) {
    return (
      <p className={styles['emptyHistory']}>
        {_('No Chalk activity yet. Grants and Board activity will appear here.')}
      </p>
    );
  }

  return (
    <ol className={styles['historyList']}>
      {entries.map((event, index) => {
        const copy = eventCopy(event, _);
        const delta =
          event.chalkDelta === 0
            ? _('No net change')
            : `${event.chalkDelta > 0 ? '+' : '\u2212'}${Math.abs(event.chalkDelta)} ${_('Chalk')}`;

        return (
          <li
            className={styles['historyRow']}
            key={`${event.eventType}-${event.createdAt}-${index}`}
          >
            <span className={styles['historyMark']} aria-hidden='true' />
            <span className={styles['historyCopy']}>
              <strong>{copy.label}</strong>
              <span>{copy.detail}</span>
            </span>
            <span className={styles['historyMeta']}>
              <span className={event.chalkDelta === 0 ? styles['neutralDelta'] : styles['delta']}>
                {delta}
              </span>
              <time dateTime={event.createdAt}>{formatEventDate(event.createdAt)}</time>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ChalkLedger({ enabled }: { enabled: boolean }) {
  const _ = useTranslation();
  const client = useLearningBoredClient();
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<CreditsState>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    setState({ status: 'loading' });

    if (!client) {
      setState({ status: 'error' });
      return () => controller.abort();
    }

    void client
      .getCredits({ signal: controller.signal })
      .then((credits) => setState({ status: 'ready', credits }))
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }
        setState({ status: 'error' });
      });

    return () => controller.abort();
  }, [client, enabled, requestVersion]);

  return (
    <section
      className={styles['section']}
      id='chalk'
      aria-labelledby='chalk-heading'
      aria-busy={state.status === 'loading'}
    >
      <div className={styles['sectionHeading']}>
        <div>
          <h2 id='chalk-heading'>{_('Chalk')}</h2>
          <p>{_('One Chalk makes one Board and its grounded recall items.')}</p>
        </div>
        {state.status === 'error' && (
          <button
            className={styles['secondaryButton']}
            type='button'
            onClick={() => setRequestVersion((version) => version + 1)}
          >
            {_('Retry')}
          </button>
        )}
      </div>

      <div className={styles['chalkRegion']}>
        {state.status === 'loading' && (
          <div className={styles['creditLoading']} role='status'>
            <span className={styles['visuallyHidden']}>{_('Loading Chalk balance...')}</span>
            <span className={styles['loadingLineLarge']} aria-hidden='true' />
            <span className={styles['loadingLine']} aria-hidden='true' />
            <span className={styles['loadingLine']} aria-hidden='true' />
          </div>
        )}

        {state.status === 'error' && (
          <div className={styles['creditError']} role='status'>
            <strong>{_('Chalk is temporarily unavailable.')}</strong>
            <p>{_('Your account and storage actions still work. Try the balance again.')}</p>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <p className={styles['visuallyHidden']} role='status'>
              {_('{{available}} Chalk available and {{reserved}} reserved.', {
                available: state.credits.availableChalk,
                reserved: state.credits.reservedChalk,
              })}
            </p>
            <dl className={styles['balanceLedger']}>
              <div className={styles['balancePrimary']}>
                <dt>{_('Available now')}</dt>
                <dd>
                  {state.credits.availableChalk}
                  <span>
                    {state.credits.availableChalk === 0
                      ? _('No Chalk available')
                      : state.credits.availableChalk === 1
                        ? _('1 Chalk ready to use')
                        : _('Chalk ready to use')}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{_('Reserved')}</dt>
                <dd>
                  {state.credits.reservedChalk}
                  <span>{_('Held by work in progress')}</span>
                </dd>
              </div>
              <div>
                <dt>{_('Granted over time')}</dt>
                <dd>{state.credits.lifetimeGranted}</dd>
              </div>
              <div>
                <dt>{_('Spent over time')}</dt>
                <dd>{state.credits.lifetimeSpent}</dd>
              </div>
            </dl>

            <div className={styles['historyHeading']}>
              <h3>{_('Recent activity')}</h3>
              <span>{_('Newest first')}</span>
            </div>
            <CreditHistory entries={state.credits.recent} />
          </>
        )}
      </div>
    </section>
  );
}

export default function LearningBoredAccountPresentation({
  status,
  userFullName,
  userEmail,
  safeAreaTop = 0,
  roundedWindow = false,
  storageOpen = false,
  storageContent,
  onBack,
  onToggleStorage,
  onResetPassword,
  onUpdateEmail,
  onSignOut,
}: LearningBoredAccountPresentationProps) {
  const _ = useTranslation();
  const theme = useLearningBoredPresentationTheme();
  const displayName = userFullName?.trim() || _('LearningBored learner');
  const shellStyle = useMemo(
    () => ({ '--lb-account-safe-top': `${safeAreaTop}px` }) as CSSProperties,
    [safeAreaTop],
  );

  return (
    <div
      className={`lb-presentation ${styles['root']}`}
      data-lb-presentation='account'
      data-lb-theme={theme}
      data-rounded-window={roundedWindow || undefined}
      style={shellStyle}
    >
      <ProfileHeader
        onGoBack={onBack}
        fixed={false}
        className={styles['profileHeader']}
        buttonClassName={styles['backButton']}
        iconClassName={styles['backIcon']}
        style={{ marginTop: safeAreaTop }}
        title={<span className={styles['headerWordmark']}>LearningBored</span>}
      />

      <div className={styles['layout']}>
        <aside className={styles['rail']} aria-label={_('Account sections')}>
          <div className={styles['railIdentity']}>
            <span className={styles['avatar']} aria-hidden='true'>
              {accountInitials(userFullName, userEmail)}
            </span>
            <div>
              <strong>{displayName}</strong>
              <span>{_('Private beta')}</span>
            </div>
          </div>

          <nav className={styles['sectionNav']} aria-label={_('On this page')}>
            <a href='#chalk'>{_('Chalk')}</a>
            <a href='#account-settings'>{_('Account settings')}</a>
            <a href='#cloud-storage'>{_('Cloud storage')}</a>
          </nav>

          <button className={styles['railAction']} type='button' onClick={onBack}>
            {_('Back to library')}
          </button>
        </aside>

        <main
          className={styles['main']}
          aria-labelledby='learningbored-account-heading'
          aria-busy={status === 'loading'}
        >
          <header className={styles['accountHeading']}>
            <h1 id='learningbored-account-heading'>{_('Account')}</h1>
            <p>{_('Manage your LearningBored session, Chalk, and private library storage.')}</p>
          </header>

          {status === 'loading' ? (
            <div className={styles['accountLoading']} role='status' aria-live='polite'>
              <span className={styles['visuallyHidden']}>{_('Loading profile...')}</span>
              <span className={styles['loadingLineLarge']} aria-hidden='true' />
              <span className={styles['loadingLine']} aria-hidden='true' />
              <span className={styles['loadingLine']} aria-hidden='true' />
            </div>
          ) : (
            <>
              <section className={styles['identitySection']} aria-labelledby='identity-heading'>
                <div>
                  <h2 id='identity-heading'>{displayName}</h2>
                  <p>{userEmail || _('Signed in')}</p>
                </div>
                <span className={styles['betaStatus']}>{_('Private beta access')}</span>
              </section>

              <ChalkLedger enabled />

              <section
                className={styles['section']}
                id='account-settings'
                aria-labelledby='settings-heading'
              >
                <div className={styles['sectionHeading']}>
                  <div>
                    <h2 id='settings-heading'>{_('Account settings')}</h2>
                    <p>{_('Use the canonical account recovery and session controls.')}</p>
                  </div>
                </div>

                <div className={styles['actionLedger']}>
                  <div className={styles['actionRow']}>
                    <div>
                      <h3>{_('Password')}</h3>
                      <p>{_('Send a secure password reset through your sign-in provider.')}</p>
                    </div>
                    <button
                      className={styles['secondaryButton']}
                      type='button'
                      onClick={onResetPassword}
                    >
                      {_('Reset password')}
                    </button>
                  </div>
                  <div className={styles['actionRow']}>
                    <div>
                      <h3>{_('Email address')}</h3>
                      <p>{_('Update the email used for this account.')}</p>
                    </div>
                    <button
                      className={styles['secondaryButton']}
                      type='button'
                      onClick={onUpdateEmail}
                    >
                      {_('Update email')}
                    </button>
                  </div>
                  <div className={styles['actionRow']}>
                    <div>
                      <h3>{_('Current session')}</h3>
                      <p>{_('Sign out on this device and return to your library.')}</p>
                    </div>
                    <button className={styles['secondaryButton']} type='button' onClick={onSignOut}>
                      {_('Sign out')}
                    </button>
                  </div>
                </div>
              </section>

              <section
                className={styles['section']}
                id='cloud-storage'
                aria-labelledby='storage-heading'
              >
                <div className={styles['storageHeading']}>
                  <div>
                    <h2 id='storage-heading'>{_('Cloud storage')}</h2>
                    <p>
                      {_(
                        'Review and remove synchronized Reader files without changing your local books.',
                      )}
                    </p>
                  </div>
                  <button
                    className={styles['primaryButton']}
                    type='button'
                    aria-expanded={storageOpen}
                    aria-controls='learningbored-storage-manager'
                    onClick={onToggleStorage}
                  >
                    {storageOpen ? _('Close storage manager') : _('Manage cloud storage')}
                  </button>
                </div>
                {storageOpen && (
                  <div className={styles['storageFrame']} id='learningbored-storage-manager'>
                    {storageContent}
                  </div>
                )}
              </section>

              <section className={styles['deletionSection']} aria-labelledby='deletion-heading'>
                <div>
                  <h2 id='deletion-heading'>{_('Account deletion')}</h2>
                  <p>
                    {_(
                      'Email support to start staged deletion. LearningBored content is removed before the Supabase sign-in identity.',
                    )}
                  </p>
                </div>
                <a
                  className={styles['deletionLink']}
                  href={`mailto:${LEARNINGBORED_SUPPORT_EMAIL}?subject=LearningBored%20account%20deletion%20request`}
                >
                  {_('Request account deletion')}
                </a>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
