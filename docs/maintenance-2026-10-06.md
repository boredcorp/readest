# StoryBored Reader maintenance - 2026-10-06

Prepared in an independent maintenance checkout. The active product checkout and its release candidate were not edited. Node remains 24.19.0; pnpm is 11.28.4. Both Reader integrations use Next.js 16.3.8, React/React DOM/RSC 19.3.0, Vitest 4.1.11, Sharp 0.35.5, DOMPurify 3.4.16, ws 8.22.0, nanoid 5.1.16, and Zustand 5.0.15.

## Changes

- Refreshed dependencies within their existing declared ranges; retained integration-specific assistant-ui minor families and native/Tauri pins.
- Native TypeScript CLI remains on stable 7.0.2; the JavaScript compiler API bridge remains 6.0.2. Playwright is held at the existing exact 1.62.1 browser-runner family; its browser acceptance remains a separate qualification gate. LearningBored retains its separately qualified 1.58.2 visual-runner family.
- Updated published security fixes for URI, XML/YAML parsing, HTTP clients, CSS/selectors, address classification, brace expansion, and archive/build tool dependencies. Minimum release age is 1440 minutes with strict Node engines.
- Preserved and rebound the existing old-iOS provider-utils patch to 4.0.57; the upstream archive passed integrity inspection and the existing lookbehind workaround was rebased against the changed upstream file offsets and applied without semantic changes. The existing Markdown autolink patch is retained.
- Removed Nunjucks' unused optional chokidar dependency. Note export only uses Environment/renderString, and upstream loads chokidar only when filesystem watching is explicitly enabled.
- KaTeX uses 0.18.10: 0.18.11 was deprecated upstream for accidental breaking changes. The pinned assistant-cloud 0.1.43 matches the integration's declared cloud API family.

## Validation scope

Reader pnpm production dependency audit: zero findings. Full audit: three high findings remain in developer tooling: extract-zip [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) and [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3), plus braces [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Public registry versions currently provide no fixes. These findings remain open; the audit is not ignored or suppressed.

Frozen lockfile-only and supply-chain checks passed with scripts disabled. No peer dependency issues remain. The frozen full install passed. The final unit suite passed 3,602 tests (7 skipped) across 177 passing files (2 skipped), plus 11 cloud-library contracts. Focused note rendering/export and native guest tests passed all 79 cases. TypeScript and Biome lint passed, the native Sharp PNG roundtrip passed, and the production Next.js web build generated all 26 static pages successfully with credential-free synthetic endpoints. Seven production image/source contracts passed. Produced assets pass translation-placeholder and lookbehind-syntax checks. The build preserves existing Serwist/Turbopack and middleware deprecation warnings. Reader patch version is 0.10.12 with an entry in release-notes.json.

Raw local evidence is under artifacts/maintenance-20261006 and is excluded from Git. Registry queries use explicit public packages. pnpm audit source inspection confirmed linked private workspace SDK names are excluded from its public name/version payload.

## Nested renderer evidence

Foliate and simplecc source and tracked runtime vendor bundles are preserved. The independent Foliate npm lockfile has separately recorded build-tool findings; these are outside the Reader pnpm audit. The pinned fflate bundle exports only unzlibSync; the reviewed fflate advisory concerns unzipSync, which is absent. PDF.js is copied from the Reader pnpm workspace via setup-vendors; the legacy tracked PDF bundle is not the Reader's imported @pdfjs module. Nested Foliate commit 9bf3199f6592bb08794f7b7068531eabd851b755 refreshes only its independent npm lock; its current audit has zero findings. The copied PDF.js library and worker are byte-identical to pdfjs-dist 6.2.108. This Foliate commit is local and unpublished; remote fetchability remains pending.

## Remaining gates

- Integration/browser and offline/PWA acceptance smoke tests.
- Target image/native-platform qualification and release-owner admission.
- Upstream fixes or reviewed mitigation for the remaining developer-tool archive and brace advisories.

This source maintenance record does not establish hosted deployment or beta acceptance.
