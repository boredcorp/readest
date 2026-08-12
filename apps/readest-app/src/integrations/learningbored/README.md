# LearningBored integration

This integration is owned by LearningBored and remains isolated from Readest core rendering. Its
`@learningbored/sdk` dependency resolves through `../../../packages/sdk`, so integration builds must
run from a complete parent `boredcorp/learningbored` checkout with recursive submodules initialized.
A standalone `boredcorp/readest` checkout does not contain that parent workspace dependency.

## Deployment topology

- The shared Vercel project `storybored-reader` is disconnected from `boredcorp/readest`, so Git pushes
  cannot trigger it. Its existing beta deployment, domains, and CLI deployment path remain owned by
  StoryBored.
- The dedicated Vercel project `learningbored-reader` connects to `boredcorp/learningbored` and uses
  `reader/apps/readest-app` as its Root Directory. Its build includes the parent SDK, synchronized
  LearningBored brand assets, and Reader vendor assets.
- Initial verification is preview-only. The LearningBored feature switch remains disabled, and no
  production deployment or promotion is part of this setup.

Never add deployment credentials, Supabase keys, generated action links, or other operator secrets to
this directory. Managed deployment configuration owns those values.

## Presentation component ownership

Repeated Reader presentation behavior stays inside this integration. `LearningBoredCloseButton` is the
local close affordance proven by the Board, Review, Progress, and attached exam-plan surfaces. It owns the
accessible label and matching title, canonical icon, 44px target, hover, and focus treatment; each panel
still owns whether the control renders, its callback, height, heading, notices, live regions, back state,
and content topology. The matching native title intentionally brings the exam-plan close action into the
same named-tooltip contract already used by the other three close controls.

Similarity alone is not an extraction contract. The Board, Review, and Progress shells remain separate
because their semantic and responsive compositions differ. Public-web components remain in the parent
web workspace; this integration never imports a shared web/Reader React package.
