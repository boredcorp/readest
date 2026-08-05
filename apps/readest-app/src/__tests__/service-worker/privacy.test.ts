import { describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_OFFLINE_CACHE_NAME,
  handlePrivacyAwareFetch,
  isExplicitPublicStaticRequest,
  purgeLegacyPrivateCaches,
} from '@/service-worker/privacy';

interface TestFetchEvent {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

function request(url: string, headers?: HeadersInit): Request {
  return new Request(url, { headers });
}

function createFetchEvent(target: Request) {
  let response: Promise<Response> | Response | undefined;
  const event: TestFetchEvent = {
    request: target,
    respondWith(nextResponse) {
      response = nextResponse;
    },
  };

  return {
    event,
    response: () => response,
  };
}

describe('Reader service-worker privacy boundary', () => {
  it('sends authorized requests directly to the network without any CacheStorage access', async () => {
    const cacheStorageMatch = vi.fn();
    const cacheStoragePut = vi.fn();
    const handleCacheableRequest = vi.fn(() => {
      cacheStorageMatch();
      cacheStoragePut();
    });
    const networkResponse = { source: 'network' } as unknown as Response;
    const fetchFromNetwork = vi.fn(async () => networkResponse);
    const target = request('https://reader.learningbored.com/library', {
      Authorization: 'Bearer private-token',
    });
    const { event, response } = createFetchEvent(target);

    handlePrivacyAwareFetch(event, {
      fetchFromNetwork,
      handleCacheableRequest,
      learningBoredApiBaseUrl: 'https://api.learningbored.com',
      serviceWorkerOrigin: 'https://reader.learningbored.com',
    });

    await expect(response()).resolves.toBe(networkResponse);
    expect(fetchFromNetwork).toHaveBeenCalledWith(target);
    expect(handleCacheableRequest).not.toHaveBeenCalled();
    expect(cacheStorageMatch).not.toHaveBeenCalled();
    expect(cacheStoragePut).not.toHaveBeenCalled();
  });

  it('bypasses CacheStorage for cross-origin /v1 traffic even without an authorization header', async () => {
    const cacheStorageMatch = vi.fn();
    const cacheStoragePut = vi.fn();
    const handleCacheableRequest = vi.fn(() => {
      cacheStorageMatch();
      cacheStoragePut();
    });
    const networkResponse = { source: 'network' } as unknown as Response;
    const fetchFromNetwork = vi.fn(async () => networkResponse);
    const target = request('https://api.example.test/v1/study-generations/job-1');
    const { event, response } = createFetchEvent(target);

    handlePrivacyAwareFetch(event, {
      fetchFromNetwork,
      handleCacheableRequest,
      serviceWorkerOrigin: 'https://reader.learningbored.com',
    });

    await expect(response()).resolves.toBe(networkResponse);
    expect(handleCacheableRequest).not.toHaveBeenCalled();
    expect(cacheStorageMatch).not.toHaveBeenCalled();
    expect(cacheStoragePut).not.toHaveBeenCalled();
  });

  it('bypasses every configured LearningBored API path, not only /v1', async () => {
    const handleCacheableRequest = vi.fn();
    const networkResponse = { source: 'network' } as unknown as Response;
    const fetchFromNetwork = vi.fn(async () => networkResponse);
    const target = request('https://api.learningbored.com/health');
    const { event, response } = createFetchEvent(target);

    handlePrivacyAwareFetch(event, {
      fetchFromNetwork,
      handleCacheableRequest,
      learningBoredApiBaseUrl: 'https://api.learningbored.com/',
      serviceWorkerOrigin: 'https://reader.learningbored.com',
    });

    await expect(response()).resolves.toBe(networkResponse);
    expect(handleCacheableRequest).not.toHaveBeenCalled();
  });

  it('bypasses presigned private-book downloads before CacheStorage can see them', async () => {
    const handleCacheableRequest = vi.fn();
    const networkResponse = { source: 'network' } as unknown as Response;
    const fetchFromNetwork = vi.fn(async () => networkResponse);
    const target = request(
      'https://account-id.r2.cloudflarestorage.com/private-books/book.epub?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=private-signature',
    );
    const { event, response } = createFetchEvent(target);

    handlePrivacyAwareFetch(event, {
      fetchFromNetwork,
      handleCacheableRequest,
      learningBoredApiBaseUrl: 'https://api.learningbored.com',
      serviceWorkerOrigin: 'https://reader.learningbored.com',
    });

    await expect(response()).resolves.toBe(networkResponse);
    expect(fetchFromNetwork).toHaveBeenCalledWith(target);
    expect(handleCacheableRequest).not.toHaveBeenCalled();
  });

  it('allows only same-origin public static paths into the runtime public cache', () => {
    const serviceWorkerOrigin = 'https://reader.learningbored.com';

    expect(
      isExplicitPublicStaticRequest(
        request('https://reader.learningbored.com/_next/static/chunks/app.js'),
        serviceWorkerOrigin,
      ),
    ).toBe(true);
    expect(
      isExplicitPublicStaticRequest(
        request('https://reader.learningbored.com/vendor/pdfjs/pdf.worker.min.mjs'),
        serviceWorkerOrigin,
      ),
    ).toBe(true);
    expect(
      isExplicitPublicStaticRequest(
        request('https://reader.learningbored.com/assets/private/book.epub?token=capability'),
        serviceWorkerOrigin,
      ),
    ).toBe(false);
    expect(
      isExplicitPublicStaticRequest(
        request('https://cdn.example.test/public-looking/book.epub'),
        serviceWorkerOrigin,
      ),
    ).toBe(false);
  });

  it('keeps safe public requests on the public-cache path', () => {
    const handleCacheableRequest = vi.fn();
    const fetchFromNetwork = vi.fn();
    const target = request('https://reader.learningbored.com/fonts/reader.woff2');
    const { event, response } = createFetchEvent(target);

    handlePrivacyAwareFetch(event, {
      fetchFromNetwork,
      handleCacheableRequest,
      learningBoredApiBaseUrl: 'https://api.learningbored.com',
      serviceWorkerOrigin: 'https://reader.learningbored.com',
    });

    expect(handleCacheableRequest).toHaveBeenCalledWith(event);
    expect(fetchFromNetwork).not.toHaveBeenCalled();
    expect(response()).toBeUndefined();
  });

  it('deletes every legacy broad offline cache during service-worker activation', async () => {
    const deleteCache = vi.fn(async () => true);

    await purgeLegacyPrivateCaches({ delete: deleteCache });

    expect(deleteCache).toHaveBeenCalledTimes(3);
    expect(deleteCache).toHaveBeenNthCalledWith(1, 'offline-cache');
    expect(deleteCache).toHaveBeenNthCalledWith(2, 'public-offline-cache-v1');
    expect(deleteCache).toHaveBeenNthCalledWith(3, 'public-offline-cache-v2');
    expect(PUBLIC_OFFLINE_CACHE_NAME).toBe('public-offline-cache-v3');
    expect(deleteCache).not.toHaveBeenCalledWith(PUBLIC_OFFLINE_CACHE_NAME);
  });
});
