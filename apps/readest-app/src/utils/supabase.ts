import { createClient } from '@supabase/supabase-js';

export type SupabaseRuntime = 'browser' | 'server';

export interface SupabaseEnvironment {
  readonly defaultPublicAnonKeyBase64?: string;
  readonly defaultPublicUrlBase64?: string;
  readonly internalUrl?: string;
  readonly nodeEnv?: string;
  readonly publicAnonKey?: string;
  readonly publicUrl?: string;
  readonly serverAnonKey?: string;
  readonly serverUrl?: string;
}

export interface SupabaseConfiguration {
  readonly anonKey: string;
  readonly logicalUrl: string;
  readonly transportUrl: string;
}

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function resolveSupabaseConfiguration(
  environment: SupabaseEnvironment = readSupabaseEnvironment(),
  runtime: SupabaseRuntime = typeof window === 'undefined' ? 'server' : 'browser',
): SupabaseConfiguration {
  const production = (environment.nodeEnv ?? process.env.NODE_ENV) === 'production';
  const publicUrl = requireSupabaseOrigin(
    configuredValue(environment.publicUrl) ?? decodeBase64(environment.defaultPublicUrlBase64),
    'NEXT_PUBLIC_SUPABASE_URL',
    { production },
  );
  const publicAnonKey = requireSupabaseValue(
    configuredValue(environment.publicAnonKey) ??
      decodeBase64(environment.defaultPublicAnonKeyBase64),
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  );

  if (runtime === 'browser') {
    return {
      anonKey: publicAnonKey,
      logicalUrl: publicUrl,
      transportUrl: publicUrl,
    };
  }

  const logicalUrl = requireSupabaseOrigin(
    configuredValue(environment.serverUrl) ?? publicUrl,
    'SUPABASE_URL',
    { production },
  );
  const transportUrl = requireSupabaseOrigin(
    configuredValue(environment.internalUrl) ?? logicalUrl,
    'SUPABASE_INTERNAL_URL',
    { privateTransport: true, production },
  );

  return {
    anonKey: configuredValue(environment.serverAnonKey) ?? publicAnonKey,
    logicalUrl,
    transportUrl,
  };
}

export function createSupabaseTransportFetch(
  logicalUrl: string,
  transportUrl: string,
  fetchImplementation: FetchImplementation = globalThis.fetch,
): FetchImplementation {
  const production = process.env.NODE_ENV === 'production';
  const logicalOrigin = requireSupabaseOrigin(logicalUrl, 'Supabase logical URL', { production });
  const transportOrigin = requireSupabaseOrigin(transportUrl, 'Supabase transport URL', {
    privateTransport: true,
    production,
  });

  return async (input, init) => {
    const inputUrl = getRequestUrl(input);
    if (logicalOrigin === transportOrigin || inputUrl.origin !== logicalOrigin) {
      return fetchImplementation(input, init);
    }

    const rewrittenUrl = new URL(inputUrl.toString());
    const transport = new URL(transportOrigin);
    rewrittenUrl.protocol = transport.protocol;
    rewrittenUrl.host = transport.host;

    if (typeof Request !== 'undefined' && input instanceof Request) {
      return fetchImplementation(new Request(rewrittenUrl, input), init);
    }

    return fetchImplementation(rewrittenUrl.toString(), init);
  };
}

const runtimeConfiguration = resolveSupabaseConfiguration();

export const supabase = createConfiguredClient(runtimeConfiguration, runtimeConfiguration.anonKey);

export const createSupabaseClient = (accessToken?: string) => {
  const configuration = resolveSupabaseConfiguration(readSupabaseEnvironment(), 'server');
  return createConfiguredClient(configuration, configuration.anonKey, { accessToken });
};

export const createSupabaseAdminClient = () => {
  const configuration = resolveSupabaseConfiguration(readSupabaseEnvironment(), 'server');
  const supabaseAdminKey = process.env['SUPABASE_ADMIN_KEY'] || '';
  return createConfiguredClient(configuration, supabaseAdminKey, { admin: true });
};

function createConfiguredClient(
  configuration: SupabaseConfiguration,
  key: string,
  options: { readonly accessToken?: string; readonly admin?: boolean } = {},
) {
  return createClient(configuration.logicalUrl, key, {
    auth: {
      ...(options.admin
        ? {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          }
        : {}),
    },
    global: {
      fetch: createSupabaseTransportFetch(configuration.logicalUrl, configuration.transportUrl),
      headers: options.accessToken
        ? {
            Authorization: `Bearer ${options.accessToken}`,
          }
        : {},
    },
  });
}

function readSupabaseEnvironment(): SupabaseEnvironment {
  return {
    defaultPublicAnonKeyBase64: process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64'],
    defaultPublicUrlBase64: process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64'],
    internalUrl: process.env['SUPABASE_INTERNAL_URL'],
    nodeEnv: process.env['NODE_ENV'],
    publicAnonKey: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    publicUrl: process.env['NEXT_PUBLIC_SUPABASE_URL'],
    serverAnonKey: process.env['SUPABASE_ANON_KEY'],
    serverUrl: process.env['SUPABASE_URL'],
  };
}

function configuredValue(value: string | undefined): string | null {
  const configured = value?.trim();
  return configured || null;
}

function decodeBase64(value: string | undefined): string | null {
  const encoded = configuredValue(value);
  if (!encoded || !/^[a-z\d+/]*={0,2}$/iu.test(encoded) || encoded.length % 4 === 1) {
    return null;
  }

  try {
    return configuredValue(globalThis.atob(encoded));
  } catch {
    return null;
  }
}

function isPrivateServiceHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (isLoopbackHostname(normalized) || !normalized.includes('.')) {
    return true;
  }

  const octets = normalized.split('.').map(Number);
  if (
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
  ) {
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }

  return normalized.startsWith('[fc') || normalized.startsWith('[fd');
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
}

function requireSupabaseOrigin(
  value: string | null,
  name: string,
  options: { readonly privateTransport?: boolean; readonly production: boolean },
): string {
  if (!value) throw new Error(`${name} is required.`);

  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      (url.protocol === 'http:' &&
        (!isPrivateServiceHostname(url.hostname) ||
          (options.production &&
            !options.privateTransport &&
            !isLoopbackHostname(url.hostname)))) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('invalid origin');
    }
    return url.origin;
  } catch {
    throw new Error(
      `${name} must be a credential-free HTTPS origin or an allowed private HTTP origin without a path or query.`,
    );
  }
}

function requireSupabaseValue(value: string | null, name: string): string {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function getRequestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string' || input instanceof URL) return new URL(input.toString());
  return new URL(input.url);
}
