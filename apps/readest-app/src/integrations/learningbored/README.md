# LearningBored integration

This integration is owned by LearningBored and remains isolated from Readest core rendering. Its
`@learningbored/sdk` dependency resolves through `../../../packages/sdk`, so integration builds must
run from a complete parent `boredcorp/learningbored` checkout with recursive submodules initialized.
A standalone `boredcorp/readest` checkout does not contain that parent workspace dependency.

## Deployment topology

- The shared Vercel project `storybored-reader` remains connected to `boredcorp/readest` for
  StoryBored. Git-triggered deployments are disabled for that project; its existing beta deployment,
  domains, and CLI deployment path remain owned by StoryBored.
- The dedicated Vercel project `learningbored-reader` connects to `boredcorp/learningbored` and uses
  `reader/apps/readest-app` as its Root Directory. Its build includes the parent SDK, synchronized
  LearningBored brand assets, and Reader vendor assets.
- Initial verification is preview-only. The LearningBored feature switch remains disabled, and no
  production deployment or promotion is part of this setup.

Never add deployment credentials, Supabase keys, generated action links, or other operator secrets to
this directory. Managed deployment configuration owns those values.
