import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkFirst, CacheFirst, ExpirationPlugin, Serwist } from 'serwist';

import {
  PUBLIC_OFFLINE_CACHE_NAME,
  handlePrivacyAwareFetch,
  isExplicitPublicStaticRequest,
  purgeLegacyPrivateCaches,
  shouldBypassServiceWorkerCache,
} from './service-worker/privacy';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serviceWorkerOrigin = self.location.origin;
const learningBoredApiBaseUrl = process.env['NEXT_PUBLIC_LEARNINGBORED_API_BASE_URL'];

function isCacheEligible(request: Request): boolean {
  return !shouldBypassServiceWorkerCache(request, {
    learningBoredApiBaseUrl,
    serviceWorkerOrigin,
  });
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
  runtimeCaching: [
    {
      matcher: ({ url, request }) => {
        const clientRoutes = ['/library', '/reader'];
        const isClientRoute = clientRoutes.some((route) => url.pathname.startsWith(route));
        return isCacheEligible(request) && isClientRoute && request.mode === 'navigate';
      },
      handler: new NetworkFirst({
        cacheName: 'client-pages',
        networkTimeoutSeconds: 3,
        matchOptions: {
          ignoreSearch: true,
        },
        plugins: [
          new ExpirationPlugin({
            maxEntries: 128,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          }),
          {
            cacheKeyWillBeUsed: async ({ request }) => {
              const url = new URL(request.url);
              const basePath = url.pathname.split('/')[1];
              const cacheKey = `${url.origin}/${basePath}`;
              return cacheKey;
            },
          },
        ],
      }),
    },
    // Fonts: CacheFirst strategy for maximum performance
    {
      matcher: ({ url, request }) => {
        // Match font files by extension
        const isFontFile = /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname);
        // Match font requests by destination
        const isFontRequest = request.destination === 'font';
        // Google Fonts stylesheets point to font files and are public by contract.
        const isGoogleFontsStylesheet =
          request.destination === 'style' && url.hostname === 'fonts.googleapis.com';

        return isCacheEligible(request) && (isFontFile || isFontRequest || isGoogleFontsStylesheet);
      },
      handler: new CacheFirst({
        cacheName: 'fonts-cache',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200, // More entries for various font files
            maxAgeSeconds: 365 * 24 * 60 * 60 * 2, // 2 years - fonts rarely change
            purgeOnQuotaError: true, // Automatically purge if storage quota exceeded
          }),
        ],
      }),
    },
    // Explicitly public same-origin application assets only. User files and capability URLs never enter
    // CacheStorage, even when they have no Authorization header.
    {
      matcher: ({ request }) =>
        isCacheEligible(request) && isExplicitPublicStaticRequest(request, serviceWorkerOrigin),
      handler: new NetworkFirst({
        cacheName: PUBLIC_OFFLINE_CACHE_NAME,
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 512,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          }),
        ],
      }),
    },
  ],
});

self.addEventListener('install', serwist.handleInstall);
self.addEventListener('activate', serwist.handleActivate);
self.addEventListener('activate', (event) => {
  event.waitUntil(purgeLegacyPrivateCaches(self.caches));
});
self.addEventListener('fetch', (event) => {
  handlePrivacyAwareFetch(event, {
    fetchFromNetwork: (request) => fetch(request),
    handleCacheableRequest: (cacheableEvent) => serwist.handleFetch(cacheableEvent),
    learningBoredApiBaseUrl,
    serviceWorkerOrigin,
  });
});
self.addEventListener('message', serwist.handleCache);
