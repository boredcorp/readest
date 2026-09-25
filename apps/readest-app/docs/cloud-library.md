# Ordinary cloud library

This web Reader flow synchronizes ordinary book files, library metadata, and coarse reading progress for the signed-in account. Annotations, notes, navigation caches, and exact reading locations stay in the account's local browser cache; this is not full annotation or reading-position synchronization.

## User behavior

- Importing a book keeps it on the device. Signing in discovers existing cloud books but never uploads local books or retries an interrupted upload automatically.
- **Upload to cloud library** explicitly enrolls one eligible local book. The required book bytes must upload before its cloud metadata is acknowledged. A cover is optional.
- **Refresh cloud library** discovers remote books and sends metadata/progress changes for books already enrolled by this account. An interrupted upload or deletion has an explicit retry action.
- A device-local book and an account cloud book with the same hash remain separate. The shelf shows one copy at a time; **Open cloud copy** and **Open local copy** switch the active copy explicitly.
- Removing a download only removes that account's cached book and cover. Confirming cloud deletion removes verified owner/book-scoped objects, records the server library tombstone, and removes that account's local reading cache. A separate device-local copy remains available.
- Selecting an eligible book file in the storage manager uses that same complete deletion flow, with confirmation covering its cover, library entry and downloaded cloud copy. Cover-only selection remains a file purge. If the file cannot be bound to the account's cloud entry, no deletion occurs; the UI directs the user to refresh the cloud library and use book details.
- A completed deletion can be followed by an explicit new upload. A newer authoritative upload from another device can replace a completed tombstone; it cannot override an unfinished local deletion.
- Marketplace books, reserved records, export-restricted books, and legacy cloud-marked rows without an owner identity are excluded from this ordinary flow. Legacy rows are preserved without assigning them to the next account to sign in.

## Persistence and ownership

The local library remains `Readest/Books/library.json` with its existing book paths. Cloud sidecars and cached files are partitioned under `Readest/Books/cloud/v1/<owner-key>/`. The owner key is a SHA-256 namespace derived from the authenticated subject, not encryption or an authorization mechanism. Server authorization remains mandatory.

Every cloud operation captures an owner lease (subject, session epoch, abort signal). Authentication supplies the matching token from the same session notification. Sign-out/account changes abort outstanding work and retire cloud views, blob URLs, and projected store rows. A same-account token refresh keeps the lease usable. Tokens, signed URLs, and transient view identities are never written to the sidecar.

IndexedDB read/modify/write transactions preserve simultaneous updates from separate connections. A queued file write/delete rechecks its captured owner/view inside the active transaction before committing. Library saves patch their original backing records; omitting a hidden row never deletes it. Deletion and import hash migration use explicit tombstones.

Each open reader view belongs to a captured origin and shared context identity. Closing a view retires its key. Delayed saves cannot borrow a reopened view or another account's same-hash book. Parallel views of the same active origin join the existing context.

Upload/delete journals retain completed substeps for retry. Deletion first resolves a complete bounded owner/book-hash object listing, validates each exact key, and records those keys before removing objects. A renamed legacy object is not assumed absent because the current title constructs a different filename. Listing inconsistencies fail visibly before deletion.

Browser Web Locks serialize per-owner/book operations; atomic IndexedDB persistence is required. This flow fails closed when either capability is unavailable. Browser backups contain local books only and do not export account sidecars or cloud reading caches.

## Verification boundary

Source tests cover local/cloud same-hash isolation, interrupted operations, stale account work, actual EPUB metadata migration, unchanged projections, concurrent views, and real IndexedDB queue/connection races. They do not establish hosted acceptance.

Before beta acceptance, the deployed candidate still requires controlled account A/B privacy checks, real book upload/discovery/download/delete readback, interrupted retry checks, storage quota enforcement, and the active plan's denial checks for every relevant hosted table. No model/provider calls are necessary for these cloud-library checks. Storage quota foundation changes and release pairing remain separate deployment requirements.
