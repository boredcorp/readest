# LearningBored service-mediated uploads — 2026-09-27

The LearningBored private-beta profile now uploads through authenticated sessions instead of giving
browsers R2 write URLs. Each request rechecks the exact Supabase subject and deletion fence. The
browser hashes the file incrementally, sends sequential chunks of at most 8 MiB, and uses status and
finalize operations. Existing file limits are unchanged; only the dedicated LearningBored integration
and its narrow storage-route hooks change. Other Reader profiles retain their existing transport.

Remote creates, parts, completion, aborts, and deletes are journaled before dispatch. Automatic SDK
retries are disabled. A lost response remains a durable obligation; elapsed time, an empty listing,
and a local timeout do not prove completion. Deletion revokes new access and preserves the subject
and cleanup records until writes settle and a later delete is acknowledged. Previously issued
Reader download links can remain usable for their existing 1,800-second lifetime.

Ordinary file deletion and bulk purge use the same journal. Pending file cleanup returns 202 and can
be resumed without fencing the whole account. Download/list routes exclude soft-deleted files.
The parent repository's restricted operator provides separate subject-fence and file-cleanup
commands; neither requires an inherited destructive account route to be enabled.

This revision requires the parent Reader migration `202609270001_reader_service_uploads` and its
authority finalizer. Deploy only with the parent LearningBored `0.21.0` contract and a newly compatible
signed rollback release. A previous direct-upload image is not an operational rollback.

Version decision: this fork integration is versioned by its immutable Git pin and the parent's
`0.21.0` minor release. No native release or unrelated upstream version is produced.

Qualification on September 27: 40 focused storage tests, Reader typecheck, and targeted lint passed.
The full provider-key-free suite with non-loopback network blocked passed 3,771 tests; seven existing
tests were skipped. These results are local source qualification. Deployed R2 races, auth boundaries,
deletion, recovery, and human accessibility acceptance remain separate gates.
