import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gte } from 'semver';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../../../..');

function readAppFile(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

describe('LearningBored native build source contract', () => {
  it('references the tracked Android adaptive-icon background drawable', () => {
    const androidResources = 'src-tauri/gen/android/app/src/main/res';
    const adaptiveIcon = readAppFile(`${androidResources}/mipmap-anydpi-v26/ic_launcher.xml`);
    const backgroundReference = adaptiveIcon.match(
      /<background\s+android:drawable="([^"]+)"\s*\/>/u,
    )?.[1];

    expect(backgroundReference).toBe('@drawable/ic_launcher_background');
    expect(
      existsSync(resolve(appRoot, androidResources, 'drawable/ic_launcher_background.xml')),
    ).toBe(true);
  });

  it('uses a Tauri CLI release that honors NDK_HOME', () => {
    const packageJson = JSON.parse(readAppFile('package.json')) as {
      devDependencies?: Record<string, string>;
    };
    const tauriCliVersion = packageJson.devDependencies?.['@tauri-apps/cli'];

    expect(tauriCliVersion).toBeDefined();
    expect(gte(tauriCliVersion ?? '0.0.0', '2.11.3')).toBe(true);
  });
});
