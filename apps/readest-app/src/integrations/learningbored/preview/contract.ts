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
