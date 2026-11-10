import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserAccessFetch } from '@/utils/browserAccessFetch';

describe('browser Access transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('includes Access cookies and refuses redirects only at the configured origin', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const accessFetch = createBrowserAccessFetch('https://api.storybored.test', fetchMock);
    const signal = new AbortController().signal;
    const init: RequestInit = {
      method: 'POST',
      headers: { Authorization: 'Bearer app-token', 'Content-Type': 'application/json' },
      body: '{"title":"A Lantern"}',
      signal,
      credentials: 'omit',
      redirect: 'follow',
    };

    await accessFetch('https://api.storybored.test/v1/scene-generations', init);
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.storybored.test/v1/scene-generations', {
      ...init,
      credentials: 'include',
      redirect: 'error',
    });
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'follow' });

    for (const url of [
      'https://api.storybored.test.attacker.example/v1/scene-generations',
      'https://other.storybored.test/file',
      'http://api.storybored.test/file',
      'https://api.storybored.test:8443/file',
      'https://objects.example/signed?signature=fixture',
    ]) {
      await accessFetch(url, init);
      expect(fetchMock).toHaveBeenLastCalledWith(url, init);
    }
  });

  it('preserves a Request and its authorization/body while applying the scoped policy', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const request = new Request('https://supabase.storybored.test/auth/v1/token', {
      method: 'POST',
      headers: { Authorization: 'Bearer app-token' },
      body: 'refresh-token-fixture',
      credentials: 'omit',
      redirect: 'follow',
    });
    await createBrowserAccessFetch('https://supabase.storybored.test', fetchMock)(request);
    expect(fetchMock).toHaveBeenCalledWith(request, { credentials: 'include', redirect: 'error' });
    expect(request.headers.get('Authorization')).toBe('Bearer app-token');
    expect(await request.text()).toBe('refresh-token-fixture');
  });

  it('preserves server requests without adding browser cookies or redirect policy', async () => {
    vi.stubGlobal('window', undefined);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const init: RequestInit = { headers: { Authorization: 'Bearer server-token' } };
    await createBrowserAccessFetch('https://api.storybored.test', fetchMock)(
      'https://api.storybored.test/v1/me/library',
      init,
    );
    expect(fetchMock).toHaveBeenCalledWith('https://api.storybored.test/v1/me/library', init);
  });
});
