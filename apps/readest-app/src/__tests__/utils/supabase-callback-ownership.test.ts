import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const probes = vi.hoisted(() => {
  return {
    createClient: vi.fn((..._args: unknown[]) => undefined),
  };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();

  return {
    ...actual,
    createClient: (...args: Parameters<typeof actual.createClient>) => {
      probes.createClient(...args);
      return actual.createClient(...args);
    },
  };
});

const deploymentProfileKey = 'NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE';
const enabledKey = 'NEXT_PUBLIC_LEARNINGBORED_ENABLED';
const supabaseAnonKey = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const supabaseUrlKey = 'NEXT_PUBLIC_SUPABASE_URL';
const originalDeploymentProfile = process.env[deploymentProfileKey];
const originalEnabled = process.env[enabledKey];
const originalSupabaseAnonKey = process.env[supabaseAnonKey];
const originalSupabaseUrl = process.env[supabaseUrlKey];

interface SupabaseClientOptionsProbe {
  auth?: {
    detectSessionInUrl?: boolean;
  };
}

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
  if (originalSupabaseAnonKey === undefined) {
    Reflect.deleteProperty(process.env, supabaseAnonKey);
  } else {
    process.env[supabaseAnonKey] = originalSupabaseAnonKey;
  }
  if (originalSupabaseUrl === undefined) {
    Reflect.deleteProperty(process.env, supabaseUrlKey);
  } else {
    process.env[supabaseUrlKey] = originalSupabaseUrl;
  }
}

function setFictionalSupabaseEnvironment(projectRef: string): void {
  process.env[supabaseAnonKey] = 'fictional-anon-key';
  process.env[supabaseUrlKey] = `https://${projectRef}.supabase.test`;
}

function singletonOptions(): SupabaseClientOptionsProbe | undefined {
  return probes.createClient.mock.calls[0]?.[2] as SupabaseClientOptionsProbe | undefined;
}

function singletonUrl(): string | undefined {
  return probes.createClient.mock.calls[0]?.[0] as string | undefined;
}

describe('Supabase callback ownership', () => {
  beforeEach(() => {
    probes.createClient.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    restorePresentationEnvironment();
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('leaves the complete recovery fragment for the selected Reader callback', async () => {
    setPresentationEnvironment({ deploymentProfile: 'private_beta', enabled: 'true' });
    setFictionalSupabaseEnvironment('selected-callback');
    const recoveryFragment =
      '#access_token=fictional-access&refresh_token=fictional-refresh&expires_in=3600&token_type=bearer&type=recovery';
    window.history.replaceState({}, '', `/auth/callback${recoveryFragment}`);
    const fetchUser = vi.fn();
    vi.stubGlobal('fetch', fetchUser);

    const { supabase } = await import('@/utils/supabase');
    await supabase.auth.initialize();

    expect(singletonOptions()?.auth?.detectSessionInUrl).toBe(false);
    expect(singletonUrl()).toBe('https://selected-callback.supabase.test');
    expect(window.location.hash).toBe(recoveryFragment);
    expect(fetchUser).not.toHaveBeenCalled();

    supabase.auth.stopAutoRefresh();
  });

  it.each([
    { enabled: undefined, label: 'default Readest', projectRef: 'default-callback' },
    { enabled: 'false', label: 'inactive integration', projectRef: 'inactive-callback' },
  ])('preserves canonical URL detection for $label', async ({ enabled, projectRef }) => {
    setPresentationEnvironment({ ...(enabled === undefined ? {} : { enabled }) });
    setFictionalSupabaseEnvironment(projectRef);

    const { supabase } = await import('@/utils/supabase');
    await supabase.auth.initialize();

    expect(singletonOptions()?.auth?.detectSessionInUrl).toBe(true);

    supabase.auth.stopAutoRefresh();
  });
});
