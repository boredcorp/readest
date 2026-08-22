import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

interface MockSupabaseClientOptions {
  readonly auth?: {
    readonly autoRefreshToken?: boolean;
    readonly detectSessionInUrl?: boolean;
    readonly persistSession?: boolean;
  };
  readonly global?: {
    readonly fetch?: typeof fetch;
    readonly headers?: Record<string, string>;
  };
}

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn((_url: string, _key: string, _options?: MockSupabaseClientOptions) => ({
    auth: {},
    from: vi.fn(),
    storage: {},
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient,
}));

import {
  createSupabaseAdminClient,
  createSupabaseClient,
  createSupabaseTransportFetch,
  resolveSupabaseConfiguration,
} from '@/utils/supabase';

describe('Reader Supabase origin separation', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.reader.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-key');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64', '');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64', '');
    vi.stubEnv('SUPABASE_URL', 'https://supabase.reader.example');
    vi.stubEnv('SUPABASE_INTERNAL_URL', 'http://supabase-kong:8000');
    vi.stubEnv('SUPABASE_ANON_KEY', 'server-anon-key');
    vi.stubEnv('SUPABASE_ADMIN_KEY', 'service-role-key');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('keeps browser identity and transport on the public external origin', () => {
    expect(
      resolveSupabaseConfiguration(
        {
          internalUrl: 'http://supabase-kong:8000',
          publicAnonKey: 'public-anon-key',
          publicUrl: 'https://supabase.reader.example',
          serverAnonKey: 'server-anon-key',
          serverUrl: 'https://supabase.server-authority.example',
        },
        'browser',
      ),
    ).toEqual({
      anonKey: 'public-anon-key',
      logicalUrl: 'https://supabase.reader.example',
      transportUrl: 'https://supabase.reader.example',
    });
  });

  test('keeps the server logical authority external while preferring internal transport', () => {
    expect(
      resolveSupabaseConfiguration(
        {
          internalUrl: 'http://supabase-kong:8000',
          publicAnonKey: 'public-anon-key',
          publicUrl: 'https://supabase.reader.example',
          serverAnonKey: 'server-anon-key',
          serverUrl: 'https://supabase.server-authority.example',
        },
        'server',
      ),
    ).toEqual({
      anonKey: 'server-anon-key',
      logicalUrl: 'https://supabase.server-authority.example',
      transportUrl: 'http://supabase-kong:8000',
    });
  });

  test('requires HTTPS logical authority in production and private hosts for HTTP transport', () => {
    expect(() =>
      resolveSupabaseConfiguration(
        {
          nodeEnv: 'production',
          publicAnonKey: 'public-anon-key',
          publicUrl: 'http://supabase.reader.example',
        },
        'browser',
      ),
    ).toThrow(/credential-free HTTPS origin/);

    expect(
      resolveSupabaseConfiguration(
        {
          nodeEnv: 'production',
          publicAnonKey: 'public-anon-key',
          publicUrl: 'http://localhost:7000',
        },
        'browser',
      ),
    ).toEqual({
      anonKey: 'public-anon-key',
      logicalUrl: 'http://localhost:7000',
      transportUrl: 'http://localhost:7000',
    });

    expect(() =>
      resolveSupabaseConfiguration(
        {
          internalUrl: 'http://supabase.reader.example',
          nodeEnv: 'production',
          publicAnonKey: 'public-anon-key',
          publicUrl: 'https://supabase.reader.example',
        },
        'server',
      ),
    ).toThrow(/allowed private HTTP origin/);
  });

  test('falls back from internal transport to the external server origin and then public origin', () => {
    expect(
      resolveSupabaseConfiguration(
        {
          publicAnonKey: 'public-anon-key',
          publicUrl: 'https://supabase.reader.example',
          serverAnonKey: 'server-anon-key',
          serverUrl: 'https://supabase.server-authority.example',
        },
        'server',
      ).transportUrl,
    ).toBe('https://supabase.server-authority.example');

    expect(
      resolveSupabaseConfiguration(
        {
          publicAnonKey: 'public-anon-key',
          publicUrl: 'https://supabase.reader.example',
        },
        'server',
      ),
    ).toEqual({
      anonKey: 'public-anon-key',
      logicalUrl: 'https://supabase.reader.example',
      transportUrl: 'https://supabase.reader.example',
    });
  });

  test('rewrites only external Supabase requests and preserves their path and query', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const transportFetch = createSupabaseTransportFetch(
      'https://supabase.reader.example',
      'http://supabase-kong:8000',
      fetchMock,
    );

    await transportFetch('https://supabase.reader.example/rest/v1/files?select=id', {
      headers: { Authorization: 'Bearer server-token' },
      method: 'GET',
    });
    await transportFetch('https://unrelated.example/resource', { method: 'GET' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://supabase-kong:8000/rest/v1/files?select=id',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://unrelated.example/resource',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('uses external logical URLs and internal fetch transport for server and admin clients', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    createSupabaseClient('reader-access-token');
    const serverCall = supabaseMocks.createClient.mock.calls.at(-1);
    expect(serverCall?.[0]).toBe('https://supabase.reader.example');
    expect(serverCall?.[1]).toBe('server-anon-key');
    expect(serverCall?.[2]).toMatchObject({
      global: {
        headers: { Authorization: 'Bearer reader-access-token' },
        fetch: expect.any(Function),
      },
    });
    await serverCall?.[2]?.global?.fetch?.('https://supabase.reader.example/auth/v1/user');
    expect(fetchMock).toHaveBeenLastCalledWith('http://supabase-kong:8000/auth/v1/user', undefined);

    createSupabaseAdminClient();
    const adminCall = supabaseMocks.createClient.mock.calls.at(-1);
    expect(adminCall?.[0]).toBe('https://supabase.reader.example');
    expect(adminCall?.[1]).toBe('service-role-key');
    expect(adminCall?.[2]).toMatchObject({
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: { fetch: expect.any(Function) },
    });
  });
});
