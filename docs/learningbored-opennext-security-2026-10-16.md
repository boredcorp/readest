# LearningBored Reader OpenNext security patch — 2026-10-16

Raise the OpenNext Cloudflare dependency floor to `1.20.2` and its compatible Wrangler floor to
`4.86.0`. The unchanged HIGH/CRITICAL scan rejected `@opennextjs/cloudflare@1.19.4` for
[CVE-2026-100409](https://github.com/opennextjs/opennextjs-cloudflare/security/advisories/GHSA-2vc4-c4r6-p6v6)
in LearningBored `0.21.13` qualification run `38856581739`. Its Reader image built successfully;
seven other jobs passed before this failure. The retained `0.21.12` Reader SBOM contains the same
package, so the owner approved replacing both selected release candidates on October 16.

This correction starts from published Reader commit `6e2be3700634eab22d3a33c2a900ac7e5711b082`.
It changes only the two manifest floors, ten required package versions in the lockfile, their peer
linkage, and this note. The transitive changes are `@opennextjs/aws` `4.1.0`, Miniflare
`4.20260426.0`, workerd `1.20260426.1`, and its five platform packages. Retain the existing AWS
SDK/Smithy graph, all overrides and patches, Next `16.4.1`, React, Sharp, native version `0.10.6`,
every nested submodule pin, and all LearningBored integration and runtime contracts.

The advisory requires Cloudflare cache interception, middleware access control, and a matching cached
route. LearningBored releases use the Node standalone server; this package finding does not establish
those exploit conditions. The package scan remains unchanged, with no advisory suppression.

Version decision: version the fork correction through its immutable merged Reader commit and parent
LearningBored `0.21.14` foundation, followed by separately qualified `0.21.15` internal-beta.
Publish and verify the correction on `integrations/learningbored` before advancing the parent pin.
No native release is produced, and original release evidence remains historical.

Official registry integrity and dependency/peer ranges were checked for all ten package replacements;
unrelated lock entries remain unchanged. The frozen installation passed with lifecycle scripts
disabled. Existing Reader lint/type checks and the unit suite remain required by the normal push
hook. Both parent revisions still require their existing exact-source image/browser qualification,
signed publication and canonical bindings. Local dependency checks do not establish those gates or
VM190 deployment acceptance.
