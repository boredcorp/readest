import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import { getLearningBoredRoutePresentation } from '@/integrations/learningbored/presentation/selection';
import { getSelectedReaderRouteMetadata } from '@/integrations/learningbored/presentation/metadata';
import LearningBoredAccountPresentation from '@/integrations/learningbored/presentation/LearningBoredAccountPresentation';
import LearningBoredAuthPresentation from '@/integrations/learningbored/presentation/LearningBoredAuthPresentation';
import LearningBoredLibraryPresentation from '@/integrations/learningbored/presentation/LearningBoredLibraryPresentation';

const deploymentProfileKey = 'NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE';
const enabledKey = 'NEXT_PUBLIC_LEARNINGBORED_ENABLED';
const originalDeploymentProfile = process.env[deploymentProfileKey];
const originalEnabled = process.env[enabledKey];

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

afterEach(() => {
  cleanup();
  restorePresentationEnvironment();
});

describe('LearningBored Reader presentation selection', () => {
  it('selects the default Readest presentation outside the LearningBored profile', () => {
    setPresentationEnvironment({});
    expect(getLearningBoredRoutePresentation()).toBe('readest');
    setPresentationEnvironment({ enabled: 'false' });
    expect(getLearningBoredRoutePresentation()).toBe('readest');
  });

  it('selects LearningBored only from the private-beta policy', () => {
    setPresentationEnvironment({ deploymentProfile: 'private_beta', enabled: 'false' });
    expect(getLearningBoredRoutePresentation()).toBe('learningbored');
    setPresentationEnvironment({ enabled: 'true' });
    expect(getLearningBoredRoutePresentation()).toBe('learningbored');
  });

  it('exposes only a zero-argument policy-derived selector', () => {
    expect(getLearningBoredRoutePresentation).toHaveLength(0);
    expect(getSelectedReaderRouteMetadata).toHaveLength(1);
  });

  it.each([
    {
      enabled: undefined,
      expectedText: 'Readest presentation',
      readestEffects: 1,
      learningBoredEffects: 0,
    },
    {
      enabled: 'true',
      expectedText: 'LearningBored presentation',
      readestEffects: 0,
      learningBoredEffects: 1,
    },
  ])(
    'mounts only the selected renderer when enabled=$enabled',
    ({ enabled, expectedText, readestEffects, learningBoredEffects }) => {
      setPresentationEnvironment({ ...(enabled === undefined ? {} : { enabled }) });
      const onReadestEffect = vi.fn();
      const onLearningBoredEffect = vi.fn();

      const ReadestProbe = () => {
        useEffect(onReadestEffect, []);
        return <span>Readest presentation</span>;
      };
      const LearningBoredProbe = () => {
        useEffect(onLearningBoredEffect, []);
        return <span>LearningBored presentation</span>;
      };

      render(
        <SelectedRoutePresentation
          presentation={getLearningBoredRoutePresentation()}
          readest={<ReadestProbe />}
          learningbored={<LearningBoredProbe />}
        />,
      );

      expect(screen.getByText(expectedText)).toBeTruthy();
      expect(onReadestEffect).toHaveBeenCalledTimes(readestEffects);
      expect(onLearningBoredEffect).toHaveBeenCalledTimes(learningBoredEffects);
    },
  );

  it('preserves Readest metadata outside the selected profile', () => {
    setPresentationEnvironment({});
    expect(getSelectedReaderRouteMetadata('auth')).toEqual({});
    expect(getSelectedReaderRouteMetadata('library')).toEqual({});
    expect(getSelectedReaderRouteMetadata('user')).toEqual({
      title: 'Account & Sign In',
      description:
        'Sign in to your Readest account or manage your subscription, cloud library storage, and account settings.',
    });
  });

  it.each([
    { Presentation: LearningBoredAuthPresentation, surface: 'auth' },
    { Presentation: LearningBoredLibraryPresentation, surface: 'library' },
    { Presentation: LearningBoredAccountPresentation, surface: 'account' },
  ])(
    'scopes the $surface token adapter to the selected presentation',
    ({ Presentation, surface }) => {
      render(
        <Presentation>
          <span>Selected route content</span>
        </Presentation>,
      );

      const boundary = screen.getByText('Selected route content').closest('.lb-presentation');
      expect(boundary).toBeTruthy();
      expect(boundary?.getAttribute('data-lb-presentation')).toBe(surface);
    },
  );

  it('provides LearningBored metadata for each selected route', () => {
    setPresentationEnvironment({ deploymentProfile: 'private_beta' });

    expect(getSelectedReaderRouteMetadata('auth')).toEqual({
      title: 'Sign in to LearningBored',
      description: 'Sign in to the LearningBored private beta.',
    });
    expect(getSelectedReaderRouteMetadata('library')).toEqual({
      title: 'LearningBored library',
      description: 'Import and open books in your private LearningBored library.',
    });
    expect(getSelectedReaderRouteMetadata('user')).toEqual({
      title: 'LearningBored account',
      description: 'Sign in to your LearningBored private-beta account or manage its settings.',
    });
  });
});
