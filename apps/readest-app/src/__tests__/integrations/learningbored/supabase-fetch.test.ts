import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLearningBoredSupabaseFetch } from '@/integrations/learningbored/supabase-fetch';

const probes = vi.hoisted(() => ({
  createClient: vi.fn((..._args: unknown[]) => ({})),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: probes.createClient }));

const publicOrigin = 'https://supabase.learningbored.com';
const privateBetaBrowser = { deploymentProfile: 'private_beta', runtime: 'browser' } as const;

afterEach(() => {
  probes.createClient.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('LearningBored Supabase browser fetch', () => {
  it.each([
    `${publicOrigin}/auth/v1/token?grant_type=password`,
    new URL(`${publicOrigin}/rest/v1/books`),
    new Request(`${publicOrigin}/storage/v1/object/private/book`),
  ])('includes Access cookies only on the canonical destination (%s)', async (input) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const fetchSupabase = createLearningBoredSupabaseFetch(privateBetaBrowser, fetcher);
    const controller = new AbortController();
    const headers = new Headers({ apikey: 'fictional-publishable-key' });
    const init: RequestInit = {
      method: 'POST',
      headers,
      body: 'fictional-password-body',
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'follow',
    };

    await fetchSupabase!(input, init);

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(input, {
      ...init,
      credentials: 'include',
      redirect: 'error',
    });
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('follow');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toBe(headers);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('preserves the original Request without consuming or rebuilding its body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const fetchSupabase = createLearningBoredSupabaseFetch(privateBetaBrowser, fetcher);
    const request = new Request(`${publicOrigin}/auth/v1/token`, {
      method: 'POST',
      body: 'fictional-body',
      credentials: 'omit',
    });

    await fetchSupabase!(request);

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(request, {
      credentials: 'include',
      redirect: 'error',
    });
    expect(request.bodyUsed).toBe(false);
    expect(request.credentials).toBe('omit');
  });

  it.each([
    'http://supabase.learningbored.com/auth/v1/token',
    'https://supabase.learningbored.com:8443/auth/v1/token',
    'https://supabase.learningbored.com.example.test/auth/v1/token',
    'https://example.test/supabase.learningbored.com',
    'https://fictional-user@supabase.learningbored.com/auth/v1/token',
    'http://learningbored-supabase-gateway:8000/auth/v1/token',
    '/auth/v1/token',
    'invalid-url',
  ])('does not add cookies or change fetch options for %s', async (input) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const fetchSupabase = createLearningBoredSupabaseFetch(privateBetaBrowser, fetcher);
    const init: RequestInit = { credentials: 'omit', redirect: 'manual' };

    await fetchSupabase!(input, init);

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(input, init);
    expect(fetcher.mock.calls[0]?.[1]).toBe(init);
  });

  it.each([
    { deploymentProfile: undefined, runtime: 'browser' },
    { deploymentProfile: 'default', runtime: 'browser' },
    { deploymentProfile: 'private_beta_typo', runtime: 'browser' },
    { deploymentProfile: 'private_beta', runtime: 'server' },
  ] as const)('leaves the default fetch unchanged for %j', (environment) => {
    const fetcher = vi.fn<typeof fetch>();

    expect(createLearningBoredSupabaseFetch(environment, fetcher)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('wires the restricted fetch into every browser client while preserving auth options', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE', 'private_beta');
    vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', publicOrigin);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fictional-publishable-key');
    vi.stubEnv('SUPABASE_ADMIN_KEY', 'fictional-server-only-key');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetcher);

    const clients = await import('@/utils/supabase');
    clients.createSupabaseClient('fictional-access-token');
    clients.createSupabaseAdminClient();

    expect(probes.createClient).toHaveBeenCalledTimes(3);
    const options = probes.createClient.mock.calls.map(
      (call) =>
        call[2] as {
          global?: { fetch?: typeof fetch; headers?: Record<string, string> };
          auth?: Record<string, boolean>;
        },
    );
    for (const clientOptions of options) {
      expect(clientOptions.global?.fetch).toBeTypeOf('function');
      await clientOptions.global!.fetch!(`${publicOrigin}/auth/v1/user`);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toEqual({ credentials: 'include', redirect: 'error' });
    }
    expect(options[0]?.auth).toEqual({ detectSessionInUrl: false });
    expect(options[1]?.global?.headers).toEqual({ Authorization: 'Bearer fictional-access-token' });
    expect(options[2]?.auth).toEqual({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
  });
});
