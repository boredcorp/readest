import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearningBoredClient } from '@/integrations/learningbored/client';
import { LearningBoredClientProvider } from '@/integrations/learningbored/LearningBoredClientContext';
import LearningBoredAccountPresentation from '@/integrations/learningbored/presentation/LearningBoredAccountPresentation';
import LearningBoredAuthPresentation from '@/integrations/learningbored/presentation/LearningBoredAuthPresentation';
import LearningBoredLibraryPresentation from '@/integrations/learningbored/presentation/LearningBoredLibraryPresentation';
import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import { learningBoredDirectionContractAttributes } from '@/integrations/learningbored/presentation/direction-contract';
import {
  getLearningBoredRoutePresentation,
  type LearningBoredRoutePresentation,
} from '@/integrations/learningbored/presentation/selection';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import type { SystemSettings } from '@/types/settings';

vi.mock('@/app/user/components/Header', () => ({
  default: ({ onGoBack }: { onGoBack: () => void }) => (
    <button type='button' onClick={onGoBack}>
      Go Back
    </button>
  ),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

const sourceRoot = resolve(import.meta.dirname, '../../..');
const deploymentProfileKey = 'NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE';
const enabledKey = 'NEXT_PUBLIC_LEARNINGBORED_ENABLED';
const originalDeploymentProfile = process.env[deploymentProfileKey];
const originalEnabled = process.env[enabledKey];
const surfaces = ['auth', 'library', 'account'] as const;

type LearningBoredSurface = (typeof surfaces)[number];

function setPresentationEnvironment(input: { deploymentProfile?: string; enabled?: string }): void {
  Reflect.deleteProperty(process.env, deploymentProfileKey);
  Reflect.deleteProperty(process.env, enabledKey);
  if (input.deploymentProfile !== undefined) {
    process.env[deploymentProfileKey] = input.deploymentProfile;
  }
  if (input.enabled !== undefined) process.env[enabledKey] = input.enabled;
}

function restorePresentationEnvironment(): void {
  setPresentationEnvironment({
    ...(originalDeploymentProfile === undefined
      ? {}
      : { deploymentProfile: originalDeploymentProfile }),
    ...(originalEnabled === undefined ? {} : { enabled: originalEnabled }),
  });
}

function pendingLearningBoredClient(): LearningBoredClient {
  return {
    getCredits: vi.fn(() => new Promise<never>(() => {})),
    listDocuments: vi.fn(() => new Promise<never>(() => {})),
  } as unknown as LearningBoredClient;
}

function selectedSurface(surface: LearningBoredSurface): ReactNode {
  if (surface === 'auth') {
    return <LearningBoredAuthPresentation>Authentication</LearningBoredAuthPresentation>;
  }
  if (surface === 'library') {
    return <LearningBoredLibraryPresentation>Library</LearningBoredLibraryPresentation>;
  }
  return (
    <LearningBoredAccountPresentation
      status='loading'
      onBack={vi.fn()}
      onResetPassword={vi.fn()}
      onSignOut={vi.fn()}
      onToggleStorage={vi.fn()}
      onUpdateEmail={vi.fn()}
    />
  );
}

function renderSelectedSurface(
  surface: LearningBoredSurface,
  presentation: LearningBoredRoutePresentation,
) {
  return render(
    <LearningBoredClientProvider value={pendingLearningBoredClient()}>
      <SelectedRoutePresentation
        presentation={presentation}
        readest={<main data-testid='readest-root'>Readest</main>}
        learningbored={selectedSurface(surface)}
      />
    </LearningBoredClientProvider>,
  );
}

beforeEach(() => {
  useThemeStore.setState({ isDarkMode: false });
  useSettingsStore.setState({ settings: {} as SystemSettings });
});

afterEach(() => {
  cleanup();
  restorePresentationEnvironment();
});

describe('LearningBored production direction contract', () => {
  it('centralizes the contract on exactly the three selected production roots', () => {
    const presentationDirectory = resolve(sourceRoot, 'integrations/learningbored/presentation');
    const consumers = readdirSync(presentationDirectory)
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) =>
        readFileSync(resolve(presentationDirectory, name), 'utf8').includes(
          '{...learningBoredDirectionContractAttributes}',
        ),
      )
      .sort();

    expect(consumers).toEqual([
      'LearningBoredAccountPresentation.tsx',
      'LearningBoredAuthPresentation.tsx',
      'LearningBoredLibraryPresentation.tsx',
    ]);
    expect(learningBoredDirectionContractAttributes).toEqual({
      'data-design-version': 'miura-study-grid-v1',
      'data-impeccable-seed': 'c0d5a557',
    });
  });

  it.each(surfaces)('emits the direction contract on selected %s', (surface) => {
    setPresentationEnvironment({ deploymentProfile: 'private_beta' });
    const { container } = renderSelectedSurface(surface, getLearningBoredRoutePresentation());
    const root = container.querySelector(`[data-lb-presentation="${surface}"]`);

    expect(root).not.toBeNull();
    for (const [attribute, value] of Object.entries(learningBoredDirectionContractAttributes)) {
      expect(root?.getAttribute(attribute)).toBe(value);
    }
    expect(screen.queryByTestId('readest-root')).toBeNull();
  });

  it.each(surfaces)('does not leak the direction contract into inactive %s', (surface) => {
    setPresentationEnvironment({ enabled: 'false' });
    const { container } = renderSelectedSurface(surface, getLearningBoredRoutePresentation());

    expect(screen.getByTestId('readest-root')).toBeTruthy();
    expect(container.querySelector(`[data-lb-presentation="${surface}"]`)).toBeNull();
    expect(container.querySelector('[data-design-version]')).toBeNull();
    expect(container.querySelector('[data-impeccable-seed]')).toBeNull();
  });
});
