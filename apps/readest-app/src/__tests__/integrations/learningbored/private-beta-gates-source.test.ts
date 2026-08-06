import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(import.meta.dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(sourceRoot, relativePath), 'utf8');
}

describe('LearningBored private-beta source gates', () => {
  it('guards every inherited payment API before request parsing or provider access', () => {
    const routes = [
      'app/api/apple/iap-verify/route.ts',
      'app/api/google/iap-verify/route.ts',
      'app/api/stripe/check/route.ts',
      'app/api/stripe/checkout/route.ts',
      'app/api/stripe/plans/route.ts',
      'app/api/stripe/portal/route.ts',
      'app/api/stripe/webhook/route.ts',
    ];

    for (const route of routes) {
      const source = readSource(route);
      const guardIndex = source.indexOf('if (!privateBetaPolicy.allowPayments)');
      expect(guardIndex, route).toBeGreaterThan(-1);
      expect(source.indexOf('status: 403', guardIndex), route).toBeGreaterThan(guardIndex);

      const requestParsingIndex = source.indexOf('await request.', guardIndex);
      if (requestParsingIndex >= 0) {
        expect(guardIndex, route).toBeLessThan(requestParsingIndex);
      }
    }
  });

  it('guards account deletion before authentication or an admin-client call', () => {
    const source = readSource('pages/api/user/delete.ts');
    const guardIndex = source.indexOf('if (!privateBetaPolicy.allowSelfServiceAccountDeletion)');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(source.indexOf('status(403)', guardIndex)).toBeGreaterThan(guardIndex);
    expect(guardIndex).toBeLessThan(source.indexOf('validateUserAndToken(', guardIndex));
    expect(guardIndex).toBeLessThan(source.indexOf('createSupabaseAdminClient(', guardIndex));
  });

  it('makes LearningBored auth sign-in-only and removes social providers', () => {
    const source = readSource('app/auth/page.tsx');

    expect(source).toContain("view={privateBetaPolicy.active ? 'sign_in' : undefined}");
    expect(source).toContain('showLinks={privateBetaPolicy.allowSignUpLinks}');
    expect(source).toContain('privateBetaPolicy.allowSocialOAuth &&');
    expect(source).toContain('providers={providers}');
    expect(source).toMatch(
      /privateBetaPolicy\.allowSocialOAuth\s*\?\s*\['google',\s*'apple',\s*'github',\s*'discord'\]\s*:\s*\[\]/u,
    );
  });

  it('gates every direct PostHog operation and does not mount its provider', () => {
    const posthogProvider = readSource('context/PHContext.tsx');
    const authContext = readSource('context/AuthContext.tsx');
    const errorPage = readSource('app/error.tsx');
    const telemetry = readSource('utils/telemetry.ts');
    const stripeClient = readSource('libs/payment/stripe/client.ts');
    const settingsMenu = readSource('app/library/components/SettingsMenu.tsx');
    const commandRegistry = readSource('services/commandRegistry.ts');
    const commandPalette = readSource('components/command-palette/CommandPaletteProvider.tsx');

    expect(posthogProvider).toContain('if (!privateBetaPolicy.allowTelemetry)');
    expect(authContext).toContain('if (privateBetaPolicy.allowTelemetry)');
    expect(errorPage).toContain('if (privateBetaPolicy.allowTelemetry)');
    expect(telemetry).toContain('privateBetaPolicy.allowTelemetry');
    expect(stripeClient).toContain('if (privateBetaPolicy.allowTelemetry)');
    expect(settingsMenu).toContain('privateBetaPolicy.allowTelemetry &&');
    expect(commandRegistry).toContain('options.allowTelemetry');
    expect(commandPalette).toContain('allowTelemetry: privateBetaPolicy.allowTelemetry');
  });

  it('replaces self-service deletion with the staged support route and hides purchase UI', () => {
    const accountActions = readSource('app/user/components/AccountActions.tsx');
    const profile = readSource('app/user/page.tsx');
    const plansHook = readSource('hooks/useAvailablePlans.ts');
    const subscriptionSuccess = readSource('app/user/subscription/success/page.tsx');

    expect(accountActions).toMatch(/mailto:\$\{LEARNINGBORED_SUPPORT_EMAIL\}/);
    expect(accountActions).toContain('Request account deletion');
    expect(accountActions).toContain('privateBetaPolicy.allowSelfServiceAccountDeletion');
    expect(accountActions).toContain('privateBetaPolicy.allowPayments');
    expect(profile).toContain('privateBetaPolicy.allowPayments &&');
    expect(plansHook).toContain('if (!privateBetaPolicy.allowPayments)');
    expect(subscriptionSuccess).toContain('if (!privateBetaPolicy.allowPayments)');
  });

  it('uses LearningBored legal links and selected account metadata in the private-beta profile', () => {
    const legalLinks = readSource('components/LegalLinks.tsx');
    const accountLayout = readSource('app/user/layout.tsx');
    const presentationMetadata = readSource('integrations/learningbored/presentation/metadata.ts');

    expect(legalLinks).toContain('https://learningbored.com/terms');
    expect(legalLinks).toContain('https://learningbored.com/privacy');
    expect(legalLinks).toContain('https://learningbored.com/cookies');
    expect(accountLayout).toContain("getSelectedReaderRouteMetadata('user')");
    expect(presentationMetadata).toContain("'LearningBored account'");
    expect(presentationMetadata).toContain('manifest: null');
    expect(presentationMetadata).toContain('icons: null');
    expect(presentationMetadata).toContain("title: 'Account & Sign In'");
  });

  it('confines selected presentation dispatch to auth, library, and account routes', () => {
    const routes = [
      ['app/auth/page.tsx', 'LearningBoredAuthPresentation'],
      ['app/library/page.tsx', 'LearningBoredLibraryPresentation'],
      ['app/user/page.tsx', 'LearningBoredAccountPresentation'],
    ] as const;

    for (const [route, learningBoredRenderer] of routes) {
      const source = readSource(route);
      expect(source, route).toContain('SelectedRoutePresentation');
      expect(source, route).toContain(learningBoredRenderer);
      expect(source, route).toContain(
        'const routePresentation = getLearningBoredRoutePresentation();',
      );
      expect(source, route).toContain('presentation={routePresentation}');
    }

    const selector = readSource('integrations/learningbored/presentation/selection.ts');
    expect(selector).toContain('getLearningBoredPrivateBetaPolicy().active');
    expect(selector).not.toMatch(/environment|LearningBoredPrivateBetaEnvironment/u);
    expect(selector).not.toMatch(/URLSearchParams|document\.|localStorage|sessionStorage|cookie/u);
  });
});
