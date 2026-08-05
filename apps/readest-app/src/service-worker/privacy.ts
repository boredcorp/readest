export const PUBLIC_OFFLINE_CACHE_NAME = 'public-offline-cache-v3';

const LEGACY_PRIVATE_CACHE_NAMES = [
  'offline-cache',
  'public-offline-cache-v1',
  'public-offline-cache-v2',
] as const;

const PUBLIC_STATIC_PATH_PREFIXES = [
  '/_next/static/',
  '/assets/',
  '/fonts/',
  '/images/',
  '/learningbored/',
  '/locales/',
  '/vendor/',
] as const;

const PUBLIC_STATIC_EXACT_PATHS = new Set([
  '/.well-known/apple-app-site-association',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/icon-tiny.png',
  '/icon.png',
  '/manifest.json',
  '/offline',
]);

interface PrivacyAwareRequestOptions {
  learningBoredApiBaseUrl?: string;
  serviceWorkerOrigin: string;
}

interface PrivacyAwareFetchEvent {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

interface PrivacyAwareFetchOptions<
  TEvent extends PrivacyAwareFetchEvent,
> extends PrivacyAwareRequestOptions {
  fetchFromNetwork(request: Request): Promise<Response>;
  handleCacheableRequest(event: TEvent): void;
}

interface CacheDeletionStore {
  delete(cacheName: string): Promise<boolean>;
}

function pathIsWithinBase(pathname: string, basePathname: string): boolean {
  const basePath = basePathname.replace(/\/$/u, '') || '/';

  return basePath === '/' || pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function hasCapabilityQuery(url: URL): boolean {
  for (const queryName of url.searchParams.keys()) {
    const normalizedName = queryName.toLowerCase();
    if (
      normalizedName.startsWith('x-amz-') ||
      normalizedName.startsWith('x-goog-') ||
      [
        'awsaccesskeyid',
        'key-pair-id',
        'policy',
        'sig',
        'signature',
        'token',
        'access_token',
      ].includes(normalizedName)
    ) {
      return true;
    }
  }

  return false;
}

function isR2StorageRequest(url: URL): boolean {
  return /(?:^|\.)r2\.cloudflarestorage\.com$/iu.test(url.hostname);
}

function isPrivateCapabilityRequest(url: URL): boolean {
  return isR2StorageRequest(url) || hasCapabilityQuery(url);
}

/** Only immutable application assets with an explicit same-origin public path are runtime-cacheable. */
export function isExplicitPublicStaticRequest(
  request: Request,
  serviceWorkerOrigin: string,
): boolean {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== serviceWorkerOrigin || isPrivateCapabilityRequest(url)) {
    return false;
  }

  return (
    PUBLIC_STATIC_EXACT_PATHS.has(url.pathname) ||
    PUBLIC_STATIC_PATH_PREFIXES.some((pathPrefix) => url.pathname.startsWith(pathPrefix))
  );
}

function isConfiguredLearningBoredApiRequest(
  url: URL,
  learningBoredApiBaseUrl: string | undefined,
  serviceWorkerOrigin: string,
): boolean {
  if (!learningBoredApiBaseUrl?.trim()) {
    return false;
  }

  try {
    const apiBaseUrl = new URL(learningBoredApiBaseUrl, serviceWorkerOrigin);
    return url.origin === apiBaseUrl.origin && pathIsWithinBase(url.pathname, apiBaseUrl.pathname);
  } catch {
    // Invalid deployment configuration is handled by the Reader configuration boundary.
    return false;
  }
}

export function shouldBypassServiceWorkerCache(
  request: Request,
  { learningBoredApiBaseUrl, serviceWorkerOrigin }: PrivacyAwareRequestOptions,
): boolean {
  const url = new URL(request.url);
  const isCrossOriginVersionedApi =
    url.origin !== serviceWorkerOrigin &&
    (url.pathname === '/v1' || url.pathname.startsWith('/v1/'));

  return (
    request.headers.has('authorization') ||
    request.credentials === 'include' ||
    isCrossOriginVersionedApi ||
    isPrivateCapabilityRequest(url) ||
    isConfiguredLearningBoredApiRequest(url, learningBoredApiBaseUrl, serviceWorkerOrigin)
  );
}

/** Routes private traffic straight to the network before Serwist can read or write CacheStorage. */
export function handlePrivacyAwareFetch<TEvent extends PrivacyAwareFetchEvent>(
  event: TEvent,
  options: PrivacyAwareFetchOptions<TEvent>,
): void {
  if (
    shouldBypassServiceWorkerCache(event.request, {
      learningBoredApiBaseUrl: options.learningBoredApiBaseUrl,
      serviceWorkerOrigin: options.serviceWorkerOrigin,
    })
  ) {
    event.respondWith(options.fetchFromNetwork(event.request));
    return;
  }

  options.handleCacheableRequest(event);
}

/** Removes the cache name used before authenticated API traffic was excluded. */
export async function purgeLegacyPrivateCaches(cacheStorage: CacheDeletionStore): Promise<void> {
  await Promise.all(LEGACY_PRIVATE_CACHE_NAMES.map((cacheName) => cacheStorage.delete(cacheName)));
}
