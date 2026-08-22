import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SENTRY_BUILD_VARIABLES = [
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
  'NEXT_PUBLIC_SENTRY_RELEASE',
];

const readRepositoryFile = (relativePath) =>
  readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

test('Sentry public configuration is available to the Next.js image build', async () => {
  const [dockerfile, compose, environmentExample] = await Promise.all([
    readRepositoryFile('../../Dockerfile'),
    readRepositoryFile('../compose.yaml'),
    readRepositoryFile('../.env.example'),
  ]);

  const buildStage = dockerfile
    .split('FROM reader-base AS build')[1]
    ?.split(/^FROM .* AS production-stage$/mu)[0];
  assert.ok(buildStage, 'Reader build stage must exist');

  const clientBuild = compose.split(/^  client:\s*$/mu)[1]?.split(/^    restart:/mu)[0];
  assert.ok(clientBuild, 'Compose client build configuration must exist');

  for (const variable of SENTRY_BUILD_VARIABLES) {
    const dockerArgument = `ARG ${variable}`;
    assert.ok(
      buildStage.includes(dockerArgument),
      `${dockerArgument} must be declared before next build`,
    );
    assert.ok(
      buildStage.indexOf(dockerArgument) < buildStage.indexOf('pnpm exec next build'),
      `${dockerArgument} must precede next build`,
    );

    assert.ok(
      clientBuild.includes(`${variable}: '\${${variable}:-}'`),
      `Compose must pass optional ${variable} into client build args`,
    );
    assert.match(
      environmentExample,
      new RegExp(`^${variable}=$`, 'mu'),
      `${variable} must be documented as optional in docker/.env.example`,
    );
  }
});
