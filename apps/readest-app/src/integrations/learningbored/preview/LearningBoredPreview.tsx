'use client';

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CloudOff,
  LoaderCircle,
  MailCheck,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';

import type { LearningBoredClient } from '../client';
import { LearningBoredClientProvider } from '../LearningBoredClientContext';
import LearningBoredAccountPresentation from '../presentation/LearningBoredAccountPresentation';
import LearningBoredAuthPresentation, {
  LearningBoredAuthActions,
  LearningBoredAuthButton,
  LearningBoredAuthField,
  LearningBoredAuthMessage,
  LearningBoredAuthStatus,
} from '../presentation/LearningBoredAuthPresentation';
import LearningBoredBrandMark from '../presentation/LearningBoredBrandMark';
import LearningBoredLibraryPresentation, {
  LearningBoredLibraryEmptyState,
  LearningBoredLibraryLoadingState,
  LearningBoredLibrarySurface,
  type LearningBoredLibraryPresentationContext,
} from '../presentation/LearningBoredLibraryPresentation';
import LearningBoredLibraryStatus from '../presentation/LearningBoredLibraryStatus';
import {
  formatLearningBoredCopy,
  LearningBoredPresentationThemeProvider,
  LearningBoredTranslationProvider,
} from '../presentation/context';
import {
  LEARNINGBORED_PREVIEW_GROUPS,
  LEARNINGBORED_PREVIEW_THEMES,
  getLearningBoredPreviewState,
  type LearningBoredPreviewStateId,
  type LearningBoredPreviewTheme,
} from './contract';
import {
  LEARNINGBORED_PREVIEW_ACCOUNT,
  LEARNINGBORED_PREVIEW_DOCUMENTS,
  createLearningBoredPreviewClient,
} from './fixtures';
import LearningBoredStudyPreview from './LearningBoredStudyPreview';
import styles from './LearningBoredPreview.module.css';

type PreviewAction = (message: string) => void;

const themeLabels: Record<LearningBoredPreviewTheme, string> = {
  light: 'Light',
  dark: 'Dark',
  eink: 'E-ink',
};

interface PreviewButtonProps {
  children: ReactNode;
  disabled?: boolean;
  onAction?: () => void;
  variant?: 'primary' | 'secondary' | 'text';
}

function PreviewButton({
  children,
  disabled = false,
  onAction,
  variant = 'secondary',
}: PreviewButtonProps) {
  return (
    <button
      className={`${styles['button']} ${styles[`button-${variant}`]}`}
      disabled={disabled}
      onClick={onAction}
      type='button'
    >
      {children}
    </button>
  );
}

interface PreviewNoticeProps {
  action?: ReactNode;
  children: ReactNode;
  title: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
}

function PreviewNotice({ action, children, title, tone = 'neutral' }: PreviewNoticeProps) {
  const Icon = tone === 'success' ? Check : tone === 'neutral' ? MailCheck : AlertTriangle;

  return (
    <section
      className={`${styles['notice']} ${styles[`notice-${tone}`]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden='true' className={styles['noticeIcon']} />
      <div className={styles['noticeBody']}>
        <h3>{title}</h3>
        <div className={styles['noticeCopy']}>{children}</div>
        {action && <div className={styles['noticeAction']}>{action}</div>}
      </div>
    </section>
  );
}

function LoadingPattern({ label }: { label: string }) {
  return (
    <div aria-busy='true' aria-live='polite' className={styles['loadingRegion']} role='status'>
      <span className={styles['visuallyHidden']}>{label}</span>
      <span aria-hidden='true' className={styles['loadingLineWide']} />
      <span aria-hidden='true' className={styles['loadingLine']} />
      <span aria-hidden='true' className={styles['loadingLineShort']} />
    </div>
  );
}

function AuthContent({ stateId, onAction }: { stateId: string; onAction: PreviewAction }) {
  switch (stateId) {
    case 'auth-initial':
      return (
        <div className={styles['authFixture']}>
          <LearningBoredAuthMessage>
            Your private-beta invitation is ready. Sign in with the invited email address.
          </LearningBoredAuthMessage>
          <LearningBoredAuthActions align='start'>
            <LearningBoredAuthButton
              onClick={() => onAction('Opened the fixture sign-in task.')}
              type='button'
            >
              Continue to sign in
            </LearningBoredAuthButton>
          </LearningBoredAuthActions>
        </div>
      );
    case 'auth-loading':
      return (
        <div className={styles['authFixture']} data-lb-auth-form>
          <LearningBoredAuthField
            disabled
            id='preview-loading-email'
            label='Email address'
            value='avery.rowan@example.invalid'
            readOnly
          />
          <LearningBoredAuthButton disabled type='button'>
            Checking your invitation…
          </LearningBoredAuthButton>
          <LearningBoredAuthMessage>
            Keep this window open while sign-in finishes.
          </LearningBoredAuthMessage>
        </div>
      );
    case 'auth-sign-in':
      return (
        <div className={styles['authFixture']} data-lb-auth-form>
          <LearningBoredAuthField
            autoComplete='email'
            id='preview-sign-in-email'
            label='Email address'
            placeholder='you@example.invalid'
            type='email'
          />
          <LearningBoredAuthField
            autoComplete='current-password'
            id='preview-sign-in-password'
            label='Password'
            type='password'
          />
          <LearningBoredAuthButton
            onClick={() => onAction('Submitted fixture credentials without a provider request.')}
            type='button'
          >
            Sign in
          </LearningBoredAuthButton>
          <LearningBoredAuthButton
            onClick={() => onAction('Opened the fixture reset state.')}
            type='button'
            variant='text'
          >
            Reset password
          </LearningBoredAuthButton>
        </div>
      );
    case 'auth-reset':
      return (
        <div className={styles['authFixture']} data-lb-auth-form>
          <LearningBoredAuthField
            hint='We send recovery instructions only when this address belongs to an invited account.'
            id='preview-reset-email'
            label='Invited email address'
            placeholder='avery.rowan@example.invalid'
            type='email'
          />
          <LearningBoredAuthButton
            onClick={() => onAction('Prepared fixture recovery instructions.')}
            type='button'
          >
            Send recovery instructions
          </LearningBoredAuthButton>
        </div>
      );
    case 'auth-recovery':
      return (
        <div className={styles['authFixture']} data-lb-auth-form>
          <LearningBoredAuthField
            hint='Use at least 12 characters. A long passphrase such as “folds open safely” is easier to remember.'
            id='preview-recovery-password'
            label='New password'
            type='password'
          />
          <LearningBoredAuthField
            id='preview-recovery-confirmation'
            label='Confirm new password'
            type='password'
          />
          <LearningBoredAuthButton
            onClick={() => onAction('Validated the fixture replacement password.')}
            type='button'
          >
            Update password
          </LearningBoredAuthButton>
        </div>
      );
    case 'auth-update':
      return (
        <div className={styles['authFixture']} data-lb-auth-form>
          <LearningBoredAuthField
            id='preview-update-email'
            label='New email address'
            placeholder='new-address@example.invalid'
            type='email'
          />
          <LearningBoredAuthMessage>
            Your current address stays active until the new address is confirmed.
          </LearningBoredAuthMessage>
          <LearningBoredAuthButton
            onClick={() => onAction('Prepared the fixture email confirmation.')}
            type='button'
          >
            Send confirmation
          </LearningBoredAuthButton>
        </div>
      );
    case 'auth-callback':
      return (
        <LearningBoredAuthStatus title='Verifying your secure link' tone='pending'>
          <p>
            Checking the invitation and restoring this Reader session. No library content is shown
            yet.
          </p>
        </LearningBoredAuthStatus>
      );
    case 'auth-invalid-link':
      return (
        <LearningBoredAuthStatus
          actions={
            <LearningBoredAuthButton
              onClick={() => onAction('Requested a fresh fixture recovery link.')}
              type='button'
              variant='secondary'
            >
              Request a new link
            </LearningBoredAuthButton>
          }
          title='This recovery link cannot be used'
          tone='error'
        >
          <p>
            It may have expired or already been used. Request a fresh link from the sign-in screen.
          </p>
        </LearningBoredAuthStatus>
      );
    case 'auth-provider-error':
      return (
        <LearningBoredAuthStatus
          actions={
            <LearningBoredAuthActions align='start'>
              <LearningBoredAuthButton
                onClick={() => onAction('Retried the fixture identity check.')}
                type='button'
              >
                Try again
              </LearningBoredAuthButton>
              <LearningBoredAuthButton
                onClick={() => onAction('Returned to the fixture sign-in task.')}
                type='button'
                variant='secondary'
              >
                Back to sign in
              </LearningBoredAuthButton>
            </LearningBoredAuthActions>
          }
          title='Sign-in service is temporarily unavailable'
          tone='error'
        >
          <p>
            Your credentials were not changed. Try again, or return later without losing local
            books.
          </p>
        </LearningBoredAuthStatus>
      );
    case 'auth-success':
      return (
        <LearningBoredAuthStatus title='Session restored' tone='success'>
          <p>Your invited account is verified. Returning to the private library now.</p>
        </LearningBoredAuthStatus>
      );
    default:
      return null;
  }
}

function AuthFixture({
  stateId,
  onAction,
  theme,
}: {
  stateId: string;
  onAction: PreviewAction;
  theme: LearningBoredPreviewTheme;
}) {
  return (
    <LearningBoredAuthPresentation
      backLabel='Return to preview states'
      description='Use this fixture-only task to inspect the selected private-beta authentication boundary.'
      heading='Sign in to continue.'
      onBack={() => onAction('Returned focus to the fixture state navigator.')}
      privacyNote='Every value on this route is fictional. No identity provider or account data is used.'
      theme={theme}
    >
      <AuthContent onAction={onAction} stateId={stateId} />
    </LearningBoredAuthPresentation>
  );
}

function LibraryBookFixture({
  document,
  onAction,
  selected = false,
}: {
  document: (typeof LEARNINGBORED_PREVIEW_DOCUMENTS)[number];
  onAction: PreviewAction;
  selected?: boolean;
}) {
  return (
    <li className={styles['bookRow']} data-selected={selected || undefined}>
      {selected && (
        <label className={styles['bookSelectionTarget']}>
          <input
            aria-label={`Select ${document.title}`}
            checked
            className={styles['bookSelection']}
            readOnly
            type='checkbox'
          />
        </label>
      )}
      <span aria-hidden='true' className={styles['bookGlyph']}>
        <BookOpen />
      </span>
      <div className={styles['bookCopy']}>
        <h3 dir='auto'>{document.title}</h3>
        <p dir='auto'>
          {document.author} · {document.format}
        </p>
        <span className={styles['visuallyHidden']}>
          {document.dueCount} due. {document.boardCount} Boards. {document.recallItemCount} recall
          items.
        </span>
        <LearningBoredLibraryStatus className={styles['documentStatus']} document={document} />
      </div>
      <PreviewButton onAction={() => onAction(`Opened fixture book: ${document.title}.`)}>
        Open
      </PreviewButton>
    </li>
  );
}

function FictionalLibraryBookList({
  documents = LEARNINGBORED_PREVIEW_DOCUMENTS,
  label,
  onAction,
  selectedIndex,
}: {
  documents?: readonly (typeof LEARNINGBORED_PREVIEW_DOCUMENTS)[number][];
  label: string;
  onAction: PreviewAction;
  selectedIndex?: number;
}) {
  // The canonical Bookshelf owns Reader stores and import/open effects. The preview therefore keeps
  // only deterministic fictional item content inside the real Library presentation and status pieces.
  return (
    <ol
      aria-label={label}
      className={styles['bookList']}
      data-lb-preview-content='fictional-library-items'
    >
      {documents.map((document, index) => (
        <LibraryBookFixture
          document={document}
          key={document.id}
          onAction={onAction}
          selected={selectedIndex === index}
        />
      ))}
    </ol>
  );
}

function LibraryStateContent({
  context,
  stateId,
  onAction,
}: {
  context: LearningBoredLibraryPresentationContext;
  stateId: string;
  onAction: PreviewAction;
}) {
  if (stateId === 'library-loading') {
    return <LearningBoredLibraryLoadingState />;
  }

  if (stateId === 'library-empty') {
    return (
      <LearningBoredLibraryEmptyState
        onImport={() => onAction('Opened the fixture import chooser.')}
      />
    );
  }

  if (stateId === 'library-no-results') {
    return context.bookshelfPresentation.emptyResult;
  }

  if (stateId === 'library-transfer-error') {
    return (
      <FictionalLibraryBookList
        documents={[LEARNINGBORED_PREVIEW_DOCUMENTS[0]]}
        label='Local fixture books'
        onAction={onAction}
      />
    );
  }

  const isSelection = stateId === 'library-selection';

  return (
    <>
      <div className={styles['libraryToolbar']}>
        <div>
          <strong>{isSelection ? '1 book selected' : '2 private books'}</strong>
          <span>
            {isSelection
              ? 'Batch actions affect only the selected fixture.'
              : '5 reviews due today'}
          </span>
        </div>
        <div className={styles['toolbarActions']}>
          {isSelection && (
            <PreviewButton onAction={() => onAction('Removed fixture selection.')}>
              Cancel selection
            </PreviewButton>
          )}
          <PreviewButton
            onAction={() => onAction('Opened the fixture import chooser.')}
            variant='primary'
          >
            Import
          </PreviewButton>
        </div>
      </div>
      <FictionalLibraryBookList
        label={isSelection ? 'Selected fixture books' : 'Imported fixture books'}
        onAction={onAction}
        selectedIndex={isSelection ? 0 : undefined}
      />
    </>
  );
}

function LibraryFixture({ stateId, onAction }: { stateId: string; onAction: PreviewAction }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const isEmpty = stateId === 'library-empty';

  return (
    <LearningBoredLibraryPresentation>
      {(context) => (
        <LearningBoredLibrarySurface
          busy={stateId === 'library-loading'}
          controlBar={
            <PreviewButton
              onAction={() => onAction('Opened the fixture import chooser.')}
              variant='primary'
            >
              Import
            </PreviewButton>
          }
          documentCount={isEmpty ? 0 : context.documentCount}
          dueCount={isEmpty ? 0 : context.dueCount}
          enrichmentStatus={context.enrichmentStatus}
          onNavigate={(destination) =>
            onAction(`Kept the fixture ${destination} navigation inside this preview.`)
          }
          pageRef={pageRef}
          syncProgress={0}
          syncing={false}
          title='Your Library'
        >
          <LibraryStateContent context={context} onAction={onAction} stateId={stateId} />
        </LearningBoredLibrarySurface>
      )}
    </LearningBoredLibraryPresentation>
  );
}

function AccountFixture({ stateId, onAction }: { stateId: string; onAction: PreviewAction }) {
  const isLoading = stateId === 'account-loading';
  const isSessionExpired = stateId === 'account-session-expired';
  const showsIdentity = !isLoading && !isSessionExpired;

  return (
    <div className={styles['accountFixture']}>
      {isSessionExpired && (
        <LearningBoredAuthStatus
          actions={
            <LearningBoredAuthButton
              onClick={() => onAction('Opened the fixture sign-in task.')}
              type='button'
            >
              Return to sign in
            </LearningBoredAuthButton>
          }
          title='Your session has expired'
          tone='error'
        >
          <p>
            Private account details are hidden. Local books stay on this device while you sign in
            again.
          </p>
        </LearningBoredAuthStatus>
      )}

      <LearningBoredAccountPresentation
        header={
          <div className={styles['accountPreviewHeader']}>
            <PreviewButton
              onAction={() => onAction('Returned to the fixture library.')}
              variant='text'
            >
              Back to library
            </PreviewButton>
            <strong>LearningBored · {LEARNINGBORED_PREVIEW_ACCOUNT.betaStatus}</strong>
          </div>
        }
        onBack={() => onAction('Returned to the fixture library.')}
        onResetPassword={() => onAction('Opened the fixture password reset.')}
        onRequestDeletion={() => onAction('Prepared a fixture-only deletion request.')}
        onSignOut={() => onAction('Signed out of the local fixture only.')}
        onToggleStorage={() => onAction('Toggled the fixture storage manager.')}
        onUpdateEmail={() => onAction('Opened the fixture email update.')}
        status={isLoading || isSessionExpired ? 'loading' : 'ready'}
        storageContent={
          <div className={styles['emptyInline']} role='status'>
            <strong>No synchronized files</strong>
            <span>Books stored only on this device remain available in the library.</span>
          </div>
        }
        storageOpen={stateId === 'account-storage-empty'}
        userEmail={showsIdentity ? LEARNINGBORED_PREVIEW_ACCOUNT.email : undefined}
        userFullName={showsIdentity ? LEARNINGBORED_PREVIEW_ACCOUNT.displayName : undefined}
      />
    </div>
  );
}

function PrimitiveFixture({ stateId, onAction }: { stateId: string; onAction: PreviewAction }) {
  if (stateId === 'primitive-loading') {
    return <LoadingPattern label='Loading a deterministic preview region…' />;
  }

  if (stateId === 'primitive-error') {
    return (
      <PreviewNotice
        action={
          <PreviewButton onAction={() => onAction('Retried the fixture operation.')}>
            Try again
          </PreviewButton>
        }
        title='The Board status could not be refreshed'
        tone='error'
      >
        <p>The last confirmed result is still available. Retry when the connection returns.</p>
      </PreviewNotice>
    );
  }

  if (stateId === 'primitive-empty') {
    return (
      <div className={styles['emptyState']}>
        <CloudOff aria-hidden='true' />
        <h3>Nothing is waiting here</h3>
        <p>
          Choose a passage in a fictional book, then use “Board it” to create the first grounded
          explanation.
        </p>
        <PreviewButton
          onAction={() => onAction('Returned to the fixture library.')}
          variant='primary'
        >
          Return to library
        </PreviewButton>
      </div>
    );
  }

  return (
    <div className={styles['primitiveActions']}>
      <PreviewButton onAction={() => onAction('Ran the primary fixture action.')} variant='primary'>
        Primary action
        <ArrowRight aria-hidden='true' />
      </PreviewButton>
      <PreviewButton onAction={() => onAction('Ran the secondary fixture action.')}>
        Secondary action
      </PreviewButton>
      <PreviewButton onAction={() => onAction('Ran the text fixture action.')} variant='text'>
        Text action
      </PreviewButton>
      <PreviewButton disabled>Action in progress</PreviewButton>
      <span className={styles['completedAction']} role='status'>
        <Check aria-hidden='true' />
        Action complete
      </span>
    </div>
  );
}

function createFixtureClientForState(stateId: LearningBoredPreviewStateId): LearningBoredClient {
  return createLearningBoredPreviewClient({
    credits: stateId === 'account-chalk-error' ? 'error' : 'ready',
    documents:
      stateId === 'library-loading'
        ? 'loading'
        : stateId === 'library-transfer-error'
          ? 'error'
          : 'ready',
  });
}

function RenderedState({
  stateId,
  onAction,
  theme,
}: {
  stateId: LearningBoredPreviewStateId;
  onAction: PreviewAction;
  theme: LearningBoredPreviewTheme;
}) {
  if (stateId.startsWith('auth-')) {
    return <AuthFixture onAction={onAction} stateId={stateId} theme={theme} />;
  }
  if (stateId.startsWith('library-'))
    return <LibraryFixture onAction={onAction} stateId={stateId} />;
  if (stateId.startsWith('account-'))
    return <AccountFixture onAction={onAction} stateId={stateId} />;
  if (
    stateId.startsWith('capture-') ||
    stateId.startsWith('generation-') ||
    stateId.startsWith('board-') ||
    stateId.startsWith('figure-') ||
    stateId.startsWith('comprehension-') ||
    stateId.startsWith('progress-') ||
    stateId.startsWith('readiness-') ||
    stateId.startsWith('review-')
  ) {
    return <LearningBoredStudyPreview onAction={onAction} stateId={stateId} theme={theme} />;
  }
  return <PrimitiveFixture onAction={onAction} stateId={stateId} />;
}

export default function LearningBoredPreview() {
  const statePlaneRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<LearningBoredPreviewTheme>('light');
  const [activeStateId, setActiveStateId] = useState<LearningBoredPreviewStateId>('auth-initial');
  const [actionMessage, setActionMessage] = useState(
    'Fixture controls update this local preview only.',
  );
  const activeState = getLearningBoredPreviewState(activeStateId);
  const fixtureClient = useMemo(() => createFixtureClientForState(activeStateId), [activeStateId]);

  return (
    <div
      aria-label='LearningBored Reader state preview'
      className={`lb-presentation ${styles['root']}`}
      data-lb-preview-fixture='deterministic'
      data-lb-preview-state={activeStateId}
      data-lb-theme={theme}
      role='region'
    >
      <button
        className={styles['skipLink']}
        onClick={() => {
          statePlaneRef.current?.focus();
        }}
        type='button'
      >
        Skip to state preview
      </button>

      <header className={styles['masthead']}>
        <div className={styles['brandLockup']}>
          <LearningBoredBrandMark className={styles['brandMark']} />
          <div>
            <h1>Reader state preview</h1>
            <p>Deterministic Operate fixtures · no account, store, network, or provider reads</p>
          </div>
        </div>

        <div aria-label='Preview theme' className={styles['themeControl']} role='group'>
          {LEARNINGBORED_PREVIEW_THEMES.map((previewTheme) => (
            <button
              aria-pressed={theme === previewTheme}
              key={previewTheme}
              onClick={() => setTheme(previewTheme)}
              type='button'
            >
              {themeLabels[previewTheme]}
            </button>
          ))}
        </div>
      </header>

      <div className={styles['workbench']}>
        <aside className={styles['stateRail']}>
          <nav aria-label='Preview states'>
            {LEARNINGBORED_PREVIEW_GROUPS.map((group) => (
              <section className={styles['stateGroup']} key={group.id}>
                <header>
                  <h2>{group.label}</h2>
                  <p>{group.description}</p>
                </header>
                <div className={styles['stateLinks']}>
                  {group.states.map((state) => (
                    <button
                      aria-current={activeStateId === state.id ? 'page' : undefined}
                      aria-label={`Show ${state.label}`}
                      key={state.id}
                      onClick={() => {
                        setActiveStateId(state.id);
                        setActionMessage('Fixture controls update this local preview only.');
                      }}
                      type='button'
                    >
                      <span>{state.label}</span>
                      <ArrowRight aria-hidden='true' />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </aside>

        <section
          aria-labelledby='preview-state-heading'
          className={styles['statePlane']}
          id='preview-state-plane'
          ref={statePlaneRef}
          tabIndex={-1}
        >
          <header className={styles['stateHeader']}>
            <div>
              <h2 id='preview-state-heading'>{activeState.label}</h2>
              <p>{activeState.description}</p>
            </div>
            <code>{activeState.id}</code>
          </header>

          <div className={styles['renderStage']}>
            <LearningBoredTranslationProvider value={formatLearningBoredCopy}>
              <LearningBoredPresentationThemeProvider value={theme}>
                <LearningBoredClientProvider value={fixtureClient}>
                  <RenderedState
                    key={activeStateId}
                    onAction={setActionMessage}
                    stateId={activeStateId}
                    theme={theme}
                  />
                </LearningBoredClientProvider>
              </LearningBoredPresentationThemeProvider>
            </LearningBoredTranslationProvider>
          </div>

          <footer className={styles['stateFooter']}>
            <p aria-live='polite'>{actionMessage}</p>
            <span>
              <LoaderCircle aria-hidden='true' /> Every value is fictional and resets on reload.
            </span>
          </footer>
        </section>
      </div>
    </div>
  );
}
