import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  REQUIRED_READER_PUBLIC_ENDPOINTS,
  validateReaderPublicEndpoints,
} from '../../apps/readest-app/container-build-config.mjs';

const readRepositoryFile = (relativePath) =>
  readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const PINNED_NODE_IMAGE =
  'docker.io/node:24.19.0-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03';

test('production Reader image is pinned, minimal, non-root, and health checked', async () => {
  const [dockerfile, nextConfig] = await Promise.all([
    readRepositoryFile('../../Dockerfile'),
    readRepositoryFile('../../apps/readest-app/next.config.mjs'),
  ]);

  assert.match(
    dockerfile,
    /^# syntax=docker\/dockerfile:1\.7@sha256:[a-f0-9]{64}$/mu,
    'Dockerfile frontend must be pinned by digest',
  );
  assert.ok(
    dockerfile.includes(`FROM ${PINNED_NODE_IMAGE} AS base`),
    'build base must pin Node 24.19.0 by digest',
  );
  assert.match(
    dockerfile,
    /corepack install --global pnpm@11\.21\.0/u,
    'builder must pin pnpm 11.21.0',
  );
  assert.match(nextConfig, /output: exportOutput \? 'export' : 'standalone'/u);
  assert.match(nextConfig, /outputFileTracingRoot: exportOutput \? undefined : storyBoredRoot/u);
  assert.match(
    nextConfig,
    /generateBuildId: readerBuildId \? async \(\) => readerBuildId : undefined/u,
  );

  const buildStage = dockerfile
    .split('FROM reader-base AS build')[1]
    ?.split(`FROM ${PINNED_NODE_IMAGE} AS production-stage`)[0];
  assert.ok(buildStage, 'Reader build stage must exist');
  assert.match(buildStage, /^ARG OCI_READER_SHA$/mu);
  for (const variable of REQUIRED_READER_PUBLIC_ENDPOINTS) {
    assert.match(buildStage, new RegExp(`^ARG ${variable}$`, 'mu'));
    assert.ok(
      buildStage.includes(`${variable}="\${${variable}}"`),
      `${variable} must be exported into the Next.js build environment`,
    );
  }
  assert.match(buildStage, /RUN node \.\/container-build-config\.mjs/u);
  assert.match(buildStage, /OCI_READER_SHA="\$\{OCI_READER_SHA\}"/u);
  assert.ok(
    buildStage.indexOf('ENV OCI_READER_SHA=') < buildStage.indexOf('pnpm exec next build'),
    'Reader SHA must be available when Next.js creates its build ID',
  );

  const production = dockerfile.split(`FROM ${PINNED_NODE_IMAGE} AS production-stage`)[1];
  assert.ok(production, 'production stage must start from the pinned clean Node image');
  assert.doesNotMatch(production, /pnpm (?:install|exec)|COPY readest\/|COPY packages\//u);
  assert.match(production, /\.next\/standalone\/ \.\//u);
  assert.match(production, /\.next\/static\/ \.\/readest\/apps\/readest-app\/\.next\/static\//u);
  assert.match(production, /\/public\/ \.\/readest\/apps\/readest-app\/public\//u);
  assert.match(production, /\nUSER node\n/u);
  assert.match(
    production,
    /HEALTHCHECK[^\n]*\n\s*CMD \["node", "-e", ".*127\.0\.0\.1:3000\/health\/live/u,
  );
  assert.match(production, /ENTRYPOINT \["node", "server\.js"\]/u);
  assert.ok(
    production.indexOf('USER node') < production.indexOf('ENTRYPOINT'),
    'runtime must drop privileges before startup',
  );
});

test('production Reader endpoints fail closed without upstream or credential fallbacks', () => {
  const validEnvironment = {
    NEXT_PUBLIC_API_BASE_URL: 'https://reader.storybored.example',
    NEXT_PUBLIC_MARKETPLACE_URL: 'https://storybored.example/marketplace',
    NEXT_PUBLIC_NODE_BASE_URL: 'https://reader.storybored.example',
    NEXT_PUBLIC_SITE_URL: 'https://storybored.example',
    NEXT_PUBLIC_STORYBORED_API_BASE_URL: 'https://api.storybored.example',
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.storybored.example',
  };

  assert.deepEqual(
    Object.keys(validateReaderPublicEndpoints(validEnvironment)).sort(),
    [...REQUIRED_READER_PUBLIC_ENDPOINTS].sort(),
  );

  for (const variable of REQUIRED_READER_PUBLIC_ENDPOINTS) {
    assert.throws(
      () => validateReaderPublicEndpoints({ ...validEnvironment, [variable]: '' }),
      new RegExp(`${variable} is required`, 'u'),
    );
  }
  assert.throws(
    () =>
      validateReaderPublicEndpoints({
        ...validEnvironment,
        NEXT_PUBLIC_NODE_BASE_URL: 'https://user:password@reader.storybored.example',
      }),
    /credential-free HTTP\(S\) URL/u,
  );
  assert.throws(
    () =>
      validateReaderPublicEndpoints({
        ...validEnvironment,
        NEXT_PUBLIC_API_BASE_URL: 'https://web.readest.com',
        NEXT_PUBLIC_NODE_BASE_URL: 'https://node.readest.com',
      }),
    /must not use an upstream or legacy fallback host/u,
  );
  assert.throws(
    () =>
      validateReaderPublicEndpoints({
        ...validEnvironment,
        NEXT_PUBLIC_MARKETPLACE_URL: 'https://market.storybored.example/marketplace',
      }),
    /StoryBored site and marketplace URLs must share one origin/u,
  );
});

test('production Reader image carries release identity and provenance labels', async () => {
  const dockerfile = await readRepositoryFile('../../Dockerfile');
  const production = dockerfile.split(' AS production-stage')[1];
  assert.ok(production, 'production stage must exist');

  const argumentsWithDefaults = {
    OCI_PRODUCT: 'storybored',
    OCI_PROJECT: 'storybored',
    OCI_REPOSITORY: 'https://github.com/boredcorp/storybored',
    OCI_VERSION: '0.0.0-local',
    OCI_ROOT_SHA: 'unknown',
    OCI_READER_SHA: 'unknown',
    OCI_BUILD_PROFILE: 'production',
    OCI_CREATED: '1970-01-01T00:00:00Z',
    PUBLIC_CONFIG_SHA256: 'unrecorded',
  };

  for (const [name, defaultValue] of Object.entries(argumentsWithDefaults)) {
    assert.match(production, new RegExp(`^ARG ${name}=${defaultValue}$`, 'mu'));
  }

  const labels = {
    'org.opencontainers.image.source': '${OCI_REPOSITORY}',
    'org.opencontainers.image.version': '${OCI_VERSION}',
    'org.opencontainers.image.revision': '${OCI_READER_SHA}',
    'org.opencontainers.image.created': '${OCI_CREATED}',
    'ai.boredcorp.product': '${OCI_PRODUCT}',
    'ai.boredcorp.project': '${OCI_PROJECT}',
    'ai.boredcorp.component': 'reader',
    'ai.boredcorp.root-revision': '${OCI_ROOT_SHA}',
    'ai.boredcorp.reader-revision': '${OCI_READER_SHA}',
    'ai.boredcorp.build-profile': '${OCI_BUILD_PROFILE}',
    'ai.boredcorp.public-config-sha256': '${PUBLIC_CONFIG_SHA256}',
  };

  for (const [name, value] of Object.entries(labels)) {
    assert.ok(production.includes(`${name}="${value}"`), `${name} must be labeled`);
  }
});

test('Reader build identity accepts only a lowercase 40-character git SHA', async () => {
  const { resolveReaderBuildId } = await import('../../apps/readest-app/build-identity.mjs');
  const validRevision = '8b48190dda90412620e3bed80a9bd7795741a347';
  const originalRevision = process.env['OCI_READER_SHA'];

  try {
    delete process.env['OCI_READER_SHA'];
    assert.equal(resolveReaderBuildId(), undefined);
    assert.equal(resolveReaderBuildId(''), undefined);
    assert.equal(resolveReaderBuildId(validRevision), validRevision);

    for (const invalidRevision of [
      'unknown',
      validRevision.slice(0, -1),
      `${validRevision}0`,
      validRevision.toUpperCase(),
      `g${validRevision.slice(1)}`,
      ' ',
    ]) {
      assert.throws(
        () => resolveReaderBuildId(invalidRevision),
        /OCI_READER_SHA must be a lowercase 40-character Git SHA when provided/u,
      );
    }
  } finally {
    if (originalRevision === undefined) delete process.env['OCI_READER_SHA'];
    else process.env['OCI_READER_SHA'] = originalRevision;
  }
});

test('root-context build keeps recursive Reader source while excluding private material', async () => {
  const [dockerfile, dockerignore, compose] = await Promise.all([
    readRepositoryFile('../../Dockerfile'),
    readRepositoryFile('../../Dockerfile.dockerignore'),
    readRepositoryFile('../compose.yaml'),
  ]);

  assert.match(compose, /context: \.\.\/\.\./u);
  assert.match(compose, /dockerfile: readest\/Dockerfile/u);
  assert.match(dockerfile, /COPY readest\/packages\/ \.\/packages\//u);
  assert.match(dockerfile, /COPY readest\/ \/app\/readest\//u);
  assert.match(dockerignore, /^!readest\/\*\*$/mu);
  assert.match(dockerignore, /^readest\/\*\*\/\.git$/mu);
  assert.match(dockerignore, /^readest\/\*\*\/\.env\*$/mu);
  assert.match(dockerignore, /^readest\/apps\/readest-app\/out$/mu);
  assert.doesNotMatch(dockerignore, /^readest\/packages\/$/mu);
  assert.doesNotMatch(dockerignore, /^readest\/packages\/simplecc-wasm\/dist(?:\/web)?$/mu);
  assert.match(dockerfile, /COPY readest\/packages\/ \.\/packages\//u);
});

test('all external Compose images use exact lowercase SHA-256 digest pins', async () => {
  const compose = await readRepositoryFile('../compose.yaml');
  const images = [...compose.matchAll(/^\s+image:\s+([^\s#]+)\s*$/gmu)].map((match) => match[1]);

  assert.ok(images.length > 0, 'Compose must declare externally sourced images');
  for (const image of images) {
    assert.match(
      image,
      /^[^@\s]+@sha256:[0-9a-f]{64}$/u,
      `${image} must be pinned to exactly 64 lowercase SHA-256 hex characters`,
    );
  }
});
