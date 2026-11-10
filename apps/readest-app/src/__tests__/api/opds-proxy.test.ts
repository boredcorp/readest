import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, HEAD, OPTIONS } from '@/app/api/opds/proxy/route';
import { LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE } from '@/integrations/learningbored/private-beta-policy';

const proxyUrl = 'https://reader.learningbored.com/api/opds/proxy';
const feedUrl = 'https://catalog.example.test/feed.xml';

describe('LearningBored private-beta OPDS proxy fence', () => {
  const fetcher = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetcher);
    fetcher.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([GET, HEAD, OPTIONS])(
    'refuses every supported method before parsing an untrusted URL',
    async (handler) => {
      vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE', 'private_beta');
      const request = new NextRequest(`${proxyUrl}?url=%ZZ&auth=fictional-auth`);

      const response = await handler(request);

      expect(response.status).toBe(403);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
      expect(await response.json()).toEqual({ error: LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    { profile: 'private_beta_typo', enabled: 'false' },
    { profile: undefined, enabled: 'true' },
  ])(
    'fails closed when the LearningBored integration is otherwise selected (%j)',
    async ({ profile, enabled }) => {
      vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE', profile);
      vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_ENABLED', enabled);

      const response = await GET(new NextRequest(`${proxyUrl}?url=${encodeURIComponent(feedUrl)}`));

      expect(response.status).toBe(403);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([GET, HEAD])('retains upstream proxy behavior outside LearningBored', async (handler) => {
    vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE', undefined);
    vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_ENABLED', 'false');
    fetcher.mockResolvedValue(
      new Response('<feed/>', { headers: { 'Content-Type': 'application/xml' } }),
    );

    const response = await handler(
      new NextRequest(`${proxyUrl}?url=${encodeURIComponent(feedUrl)}`),
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      feedUrl,
      expect.objectContaining({
        method: handler === GET ? 'GET' : 'HEAD',
      }),
    );
  });

  it('retains upstream preflight behavior outside LearningBored without fetching', async () => {
    vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE', undefined);
    vi.stubEnv('NEXT_PUBLIC_LEARNINGBORED_ENABLED', 'false');

    const response = await OPTIONS(new NextRequest(proxyUrl));

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
