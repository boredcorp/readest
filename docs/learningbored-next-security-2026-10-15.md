# LearningBored Reader Next security patch — 2026-10-15

Pin Next.js to `16.4.1` to address the security findings that stopped the Reader image in the
LearningBored `0.21.11` qualification. This patch starts from the accepted Reader pin
`80045db36b6b8132a2f07a9fa6f265112d775464`; it does not import another branch's UI or upstream work.

The change is limited to the exact Next dependency, its resolved lock metadata, and this release note.
Retain Sharp `0.35.5`, React, the Node runtime, every nested submodule pin, the Reader integration,
and all migration and runtime contracts. The existing security policy remains unchanged.

Version decision: version this fork correction through its immutable Reader commit and the parent
LearningBored `0.21.12` foundation release, followed by the planned compatible `0.21.13` internal-beta
successor. The upstream/native application version remains `0.10.6`; no native release is produced.
Publish and verify the Reader correction in `boredcorp/readest` on `integrations/learningbored`
before updating the parent's gitlink.

Preparation is not qualification: lock-only metadata resolution does not install or execute new
packages. On October 15 the owner approved the exact ten `16.4.1` release-age exclusions: `next`,
`@next/env`, and the eight platform-specific `@next/swc-*` packages enumerated in the parent's
`pnpm-workspace.yaml`. The exclusions are exact package/version entries, not a wildcard; the strict
age gate and all other dependency policy remain enabled.

The frozen installation passed with lifecycle scripts disabled. Existing Reader lint/type checks
passed, and the offline two-worker unit suite passed 3,771 tests in 194 files, with seven existing
skips across two skipped files and one partially skipped file. No local production image or browser
qualification is claimed. Both parent releases still require their existing exact-source
qualification and publication; this note does not record those gates as passed.
