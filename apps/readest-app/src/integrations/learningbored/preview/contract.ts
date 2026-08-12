export const LEARNINGBORED_PREVIEW_THEMES = ['light', 'dark', 'eink'] as const;

export type LearningBoredPreviewTheme = (typeof LEARNINGBORED_PREVIEW_THEMES)[number];

export const LEARNINGBORED_PREVIEW_GROUPS = [
  {
    id: 'auth',
    label: 'Authentication',
    description: 'Invitation, recovery, callback, and provider boundaries.',
    states: [
      {
        id: 'auth-initial',
        label: 'Invitation check',
        description: 'The unauthenticated entry state before a learner chooses a sign-in action.',
      },
      {
        id: 'auth-loading',
        label: 'Loading sign-in',
        description:
          'A pending form that prevents duplicate submission and names the work underway.',
      },
      {
        id: 'auth-sign-in',
        label: 'Sign in',
        description:
          'The private-beta email and password task without public registration or OAuth.',
      },
      {
        id: 'auth-reset',
        label: 'Reset request',
        description: 'A password-reset request that preserves the learner-entered address.',
      },
      {
        id: 'auth-recovery',
        label: 'Recovery password',
        description: 'A valid recovery session ready to accept a replacement password.',
      },
      {
        id: 'auth-update',
        label: 'Update email',
        description: 'An authenticated identity update with an explicit confirmation boundary.',
      },
      {
        id: 'auth-callback',
        label: 'Callback verification',
        description: 'The provider callback while the Reader verifies and restores the session.',
      },
      {
        id: 'auth-invalid-link',
        label: 'Invalid or expired link',
        description: 'An unusable recovery link with a clear route back to a safe action.',
      },
      {
        id: 'auth-provider-error',
        label: 'Provider error',
        description: 'A temporary identity-provider failure with retry and recovery choices.',
      },
      {
        id: 'auth-success',
        label: 'Successful redirect',
        description: 'A verified session while the Reader returns the learner to their library.',
      },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    description: 'Local books remain usable while LearningBored status enriches the shelf.',
    states: [
      {
        id: 'library-loading',
        label: 'Loading library',
        description: 'The initial local shelf load with its destination and progress named.',
      },
      {
        id: 'library-empty',
        label: 'Empty library',
        description: 'A first-use state with one direct import action and no invented content.',
      },
      {
        id: 'library-imported',
        label: 'Imported library',
        description:
          'Fictional imported books ordered by due attention without mutating source data.',
      },
      {
        id: 'library-no-results',
        label: 'No search results',
        description: 'A reversible search miss that keeps the underlying private library intact.',
      },
      {
        id: 'library-selection',
        label: 'Selection mode',
        description: 'A named selection state with independent open and batch actions.',
      },
      {
        id: 'library-transfer-error',
        label: 'Transfer unavailable',
        description: 'A sync failure that leaves local reading and import controls available.',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account and status',
    description: 'Identity, beta access, Chalk, session, and storage boundaries.',
    states: [
      {
        id: 'account-loading',
        label: 'Loading account',
        description: 'A bounded profile load with account navigation still recognizable.',
      },
      {
        id: 'account-ready',
        label: 'Active beta account',
        description: 'Fictional identity, invite status, and non-monetary Chalk at rest.',
      },
      {
        id: 'account-chalk-error',
        label: 'Chalk unavailable',
        description: 'A sectional balance failure that does not block identity or storage actions.',
      },
      {
        id: 'account-session-expired',
        label: 'Expired session',
        description:
          'A signed-out boundary that explains what happened without exposing private data.',
      },
      {
        id: 'account-storage-empty',
        label: 'Empty cloud storage',
        description:
          'An empty synchronized-file state that distinguishes local books from cloud data.',
      },
    ],
  },
  {
    id: 'capture',
    label: 'Passage capture',
    description: 'Selection readiness and the exact-text boundary for unsupported PDFs.',
    states: [
      {
        id: 'capture-ready',
        label: 'Selection ready',
        description:
          'A source passage ready for one grounded Board request beside the still-visible book.',
      },
      {
        id: 'capture-pdf-unavailable',
        label: 'Unsupported PDF',
        description:
          'The exact-text safeguard explains why PDF capture is unavailable at this Reader pin.',
      },
    ],
  },
  {
    id: 'generation',
    label: 'Board generation',
    description: 'Truthful stages, connection recovery, cancellation, failure, refund, and retry.',
    states: [
      {
        id: 'generation-starting',
        label: 'Starting Board',
        description:
          'The single request is being reserved and started without duplicate submission.',
      },
      {
        id: 'generation-queued',
        label: 'Queued',
        description: 'The request is durable and waiting for the generation worker.',
      },
      {
        id: 'generation-extracting',
        label: 'Extracting concepts',
        description: 'The source passage is being read for anchored concepts.',
      },
      {
        id: 'generation-composing',
        label: 'Composing Board',
        description: 'One extraction is becoming both the Board and its grounded recall items.',
      },
      {
        id: 'generation-illustrating',
        label: 'Illustrating Figure',
        description:
          'A depictive Figure is being generated and checked without blocking the outline.',
      },
      {
        id: 'generation-rendering',
        label: 'Rendering Board',
        description:
          'The validated spec is being rendered deterministically with its complete outline.',
      },
      {
        id: 'generation-poll-error',
        label: 'Status recovery',
        description: 'The last confirmed stage remains visible while the serial poller reconnects.',
      },
      {
        id: 'generation-cancelled-refunded',
        label: 'Cancelled and refunded',
        description: 'Cancelled work saved no partial artifact and returned its reserved Chalk.',
      },
      {
        id: 'generation-failed-refunded',
        label: 'Failed and refunded',
        description: 'A terminal safety failure names the problem, refund, and retry action.',
      },
      {
        id: 'generation-retry-recovery',
        label: 'Retry recovery',
        description: 'A new attempt is queued while the prior terminal record remains intact.',
      },
    ],
  },
  {
    id: 'board',
    label: 'Board result',
    description: 'Source, outline, provenance, free projections, and media-independent completion.',
    states: [
      {
        id: 'board-complete',
        label: 'Complete Board',
        description:
          'An anchored Board with added help, source links, an undefined concept, and dropped-claim disclosure.',
      },
      {
        id: 'board-svg-unavailable',
        label: 'Board without SVG',
        description:
          'The complete outline and Figure description remain usable without the Board SVG.',
      },
    ],
  },
  {
    id: 'figure',
    label: 'Figure resilience',
    description: 'Structural fallback and the charged, durable single-Figure replacement boundary.',
    states: [
      {
        id: 'figure-load-failure',
        label: 'Figure fallback',
        description:
          'Private bytes failed to load, leaving the description and structural form intact.',
      },
      {
        id: 'figure-replacement-confirm',
        label: 'Replace Figure',
        description: 'The learner sees the one-Chalk cost before confirming one closed issue.',
      },
      {
        id: 'figure-replacement-progress',
        label: 'Replacement in progress',
        description: 'The current Figure remains published while its replacement is checked.',
      },
      {
        id: 'figure-replacement-success',
        label: 'Replacement complete',
        description: 'The accepted Figure is published and one Chalk is charged exactly once.',
      },
      {
        id: 'figure-replacement-failed-refunded',
        label: 'Replacement failed and refunded',
        description: 'The old Figure remains unchanged and the replacement Chalk is returned.',
      },
    ],
  },
  {
    id: 'comprehension',
    label: 'Comprehension feedback',
    description: 'One passage-specific answer records whether the Board resolved the difficulty.',
    states: [
      {
        id: 'comprehension-unanswered',
        label: 'Comprehension check',
        description: 'The two-state question is ready after the Board, not before it.',
      },
      {
        id: 'comprehension-breakthrough',
        label: 'Passage clicked',
        description: 'A fictional breakthrough response is recorded once for this passage.',
      },
      {
        id: 'comprehension-still-unclear',
        label: 'Still unclear',
        description: 'The response suggests a different Board shape or a wider source passage.',
      },
    ],
  },
  {
    id: 'progress',
    label: 'Progress and readiness',
    description:
      'Actionable concept mastery, Board drill-ins, and the strictly opt-in exam overlay.',
    states: [
      {
        id: 'progress-loading',
        label: 'Loading progress',
        description: 'The current document stays visible while grounded mastery is derived.',
      },
      {
        id: 'progress-error',
        label: 'Progress unavailable',
        description: 'A bounded read failure names the local retry without inventing progress.',
      },
      {
        id: 'progress-empty',
        label: 'No concepts yet',
        description: 'The empty state explains that grounded recall must exist before mastery can.',
      },
      {
        id: 'progress-overview',
        label: 'Four mastery states',
        description:
          'New, learning, retained, and lapsed concepts are labelled and ordered by attention.',
      },
      {
        id: 'progress-concept',
        label: 'Concept actions',
        description:
          'One selected concept exposes due recall, exact Board links, and its review action.',
      },
      {
        id: 'progress-board',
        label: 'Progress Board drill-in',
        description: 'A source Board opens inside the same non-occluding work surface.',
      },
      {
        id: 'progress-board-error',
        label: 'Board drill-in unavailable',
        description: 'A failed Board read preserves progress and offers a local retry.',
      },
      {
        id: 'readiness-objectives',
        label: 'Attached exam readiness',
        description:
          'An explicitly attached fictional blueprint adds weighted objectives beside concept actions.',
      },
      {
        id: 'readiness-not-started',
        label: 'Readiness not started',
        description: 'Unstarted objectives remain truthful and never collapse into a zero score.',
      },
    ],
  },
  {
    id: 'review',
    label: 'Review session',
    description:
      'The complete answer-free retrieval, reveal, grade, replay, recovery, and continuation sequence.',
    states: [
      {
        id: 'review-start',
        label: 'Review start',
        description: 'Due work and the daily target are named before the learner begins.',
      },
      {
        id: 'review-question',
        label: 'Answer-free question',
        description: 'Only the question and safe choices exist before deliberate reveal.',
      },
      {
        id: 'review-selected-choice',
        label: 'Selected choice',
        description: 'A learner choice is visible without exposing correctness or rationale.',
      },
      {
        id: 'review-reveal-request',
        label: 'Reveal in progress',
        description: 'The deliberate answer read is pending while the question remains available.',
      },
      {
        id: 'review-revealed',
        label: 'Revealed answer',
        description: 'The answer, rationale, exact source, and four interval choices now appear.',
      },
      {
        id: 'review-grading',
        label: 'Grade in progress',
        description: 'One replay-safe scheduling write is pending after a revealed answer.',
      },
      {
        id: 'review-outbox-pending',
        label: 'Pending grade outbox',
        description: 'An uncertain write keeps its exact answer-free request identity for retry.',
      },
      {
        id: 'review-recovery',
        label: 'Grade recovery',
        description: 'A rejected or stale occurrence stops safely and offers a truthful reload.',
      },
      {
        id: 'review-suppression',
        label: 'Question removed',
        description:
          'An ambiguous item leaves this session while its prior review history remains.',
      },
      {
        id: 'review-continuation',
        label: 'More review available',
        description:
          'A bounded page ends with an explicit continuation instead of false completion.',
      },
      {
        id: 'review-empty',
        label: 'Nothing due',
        description: 'An honest empty queue offers no invented review task.',
      },
      {
        id: 'review-complete',
        label: 'Review complete',
        description:
          'Confirmed grades are counted and the learner can return to reading or progress.',
      },
    ],
  },
  {
    id: 'primitives',
    label: 'Primitive resilience',
    description: 'Shared loading, error, empty, action, and disabled treatments.',
    states: [
      {
        id: 'primitive-loading',
        label: 'Loading primitive',
        description: 'A named, reduced-motion-safe wait state.',
      },
      {
        id: 'primitive-error',
        label: 'Error primitive',
        description: 'A specific problem paired with a local recovery action.',
      },
      {
        id: 'primitive-empty',
        label: 'Empty primitive',
        description: 'A zero-data state that explains the next useful action.',
      },
      {
        id: 'primitive-action',
        label: 'Action primitive',
        description: 'Primary, secondary, text, disabled, and completed action states together.',
      },
    ],
  },
] as const;

export type LearningBoredPreviewGroup = (typeof LEARNINGBORED_PREVIEW_GROUPS)[number];
export type LearningBoredPreviewState = LearningBoredPreviewGroup['states'][number];
export type LearningBoredPreviewStateId = LearningBoredPreviewState['id'];

export function getLearningBoredPreviewState(
  stateId: LearningBoredPreviewStateId,
): LearningBoredPreviewState {
  for (const group of LEARNINGBORED_PREVIEW_GROUPS) {
    for (const state of group.states as readonly LearningBoredPreviewState[]) {
      if (state.id === stateId) return state;
    }
  }

  return LEARNINGBORED_PREVIEW_GROUPS[0].states[0];
}
