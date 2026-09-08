# Reader preview storage checks after Next 16.2.11

The exact LearningBored main release run 34212447359 passed 458 of 460 Reader functional cases.
Both failing assertions found only the new `__next_debug_channel:<requestId>` entry written by the
Next development server: the clean-reload case expected no storage, and the fixture-boundary case
expected its seeded hostile storage values unchanged. The pinned framework implementation is
[Next 16.2.11 debug-channel.ts](https://github.com/vercel/next.js/blob/v16.2.11/packages/next/src/client/dev/debug-channel.ts).

Exclude only that exact framework sessionStorage prefix from these two assertions. Keep every
localStorage key and every other sessionStorage key under the original equality checks. Seed two
lookalike session keys to prove the exception neither matches a key without the colon nor an
application key containing the namespace later in its name. Keep all network, preview-state,
hostile-value, reading-marker, responsive and reload assertions unchanged.

This changes the integration's browser tests only. Application source, runtime dependencies,
native version and image behavior are unchanged. The parent LearningBored release records the
new Reader commit with its own patch version and must still pass the required final release jobs.
