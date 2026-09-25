import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the access module before importing fetch utilities
vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchWithTimeout, fetchWithAuth } from '@/utils/fetch';
import { getAccessToken } from '@/utils/access';
import { webcrypto } from 'node:crypto';
import { publishCloudSession, captureCloudLease } from '@/services/cloudOwnerSession';

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fetch with the given URL and options', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK'));

    const promise = fetchWithTimeout('https://example.com', { method: 'GET' });
    vi.advanceTimersByTime(0);
    await promise;

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://example.com');
    expect(opts.method).toBe('GET');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes an AbortSignal to fetch', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK'));

    const promise = fetchWithTimeout('https://example.com');
    vi.advanceTimersByTime(0);
    await promise;

    const opts = mockFetch.mock.calls[0]![1];
    expect(opts.signal).toBeDefined();
  });

  it('uses default timeout of 10000ms', async () => {
    // Create a fetch that will hang until aborted
    mockFetch.mockImplementationOnce(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    const promise = fetchWithTimeout('https://slow.example.com');

    // Advance to just before default timeout
    vi.advanceTimersByTime(9999);
    // The promise should still be pending (not rejected yet)

    // Advance past the timeout
    vi.advanceTimersByTime(2);
    await expect(promise).rejects.toThrow();
  });

  it('uses custom timeout value', async () => {
    mockFetch.mockImplementationOnce(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    const promise = fetchWithTimeout('https://slow.example.com', {}, 500);

    vi.advanceTimersByTime(501);
    await expect(promise).rejects.toThrow();
  });

  it('clears timeout when fetch completes before timeout', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    mockFetch.mockResolvedValueOnce(new Response('OK'));

    const promise = fetchWithTimeout('https://fast.example.com');
    vi.advanceTimersByTime(0);
    await promise;

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('merges provided options with signal', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK'));

    const promise = fetchWithTimeout('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key": "value"}',
    });
    vi.advanceTimersByTime(0);
    await promise;

    const opts = mockFetch.mock.calls[0]![1];
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(opts.body).toBe('{"key": "value"}');
    expect(opts.signal).toBeDefined();
  });
});

describe('fetchWithAuth', () => {
  it('uses the captured owner without awaiting a replacement token lookup', async () => {
    vi.stubGlobal('crypto', webcrypto);
    publishCloudSession({ subject: 'fixture-A', token: 'synthetic-A' });
    const lease = await captureCloudLease();
    mockFetch.mockResolvedValueOnce(new Response('OK'));
    await fetchWithAuth('https://fixture.invalid/storage', { method: 'GET' }, lease);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(mockFetch.mock.calls[0]![1]).toMatchObject({
      headers: { Authorization: 'Bearer synthetic-A' },
      signal: lease.signal,
    });
    publishCloudSession(null);
  });

  it('refuses a captured old-owner request before dispatch after account switch', async () => {
    vi.stubGlobal('crypto', webcrypto);
    publishCloudSession({ subject: 'fixture-A', token: 'synthetic-A' });
    const lease = await captureCloudLease();
    publishCloudSession({ subject: 'fixture-B', token: 'synthetic-B' });
    await expect(
      fetchWithAuth('https://fixture.invalid/storage', { method: 'DELETE' }, lease),
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
    publishCloudSession(null);
  });

  it('aborts a captured owner request and rejects its late response after sign-out', async () => {
    vi.stubGlobal('crypto', webcrypto);
    publishCloudSession({ subject: 'fixture-A', token: 'synthetic-A' });
    const lease = await captureCloudLease();
    const pending = Promise.withResolvers<Response>();
    mockFetch.mockReturnValueOnce(pending.promise);
    const fetching = fetchWithAuth('https://fixture.invalid/storage', { method: 'GET' }, lease);
    publishCloudSession(null);
    pending.resolve(new Response('OK'));
    await expect(fetching).rejects.toThrow();
    expect(lease.signal.aborted).toBe(true);
  });
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(getAccessToken).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when not authenticated (no token)', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce(null);

    await expect(fetchWithAuth('https://api.example.com/data', { method: 'GET' })).rejects.toThrow(
      'Not authenticated',
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('adds Authorization header with Bearer token', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce('my-token-123');
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    await fetchWithAuth('https://api.example.com/data', { method: 'GET' });

    const opts = mockFetch.mock.calls[0]![1];
    expect(opts.headers.Authorization).toBe('Bearer my-token-123');
  });

  it('merges existing headers with Authorization', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce('token');
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    await fetchWithAuth('https://api.example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const opts = mockFetch.mock.calls[0]![1];
    expect(opts.headers.Authorization).toBe('Bearer token');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('returns the response on success', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce('token');
    const mockResponse = new Response('data', { status: 200 });
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await fetchWithAuth('https://api.example.com', { method: 'GET' });
    expect(result).toBe(mockResponse);
  });

  it('throws when response is not ok', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce('token');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden',
      json: async () => ({ error: 'Access denied' }),
    });

    await expect(fetchWithAuth('https://api.example.com', { method: 'GET' })).rejects.toThrow(
      'Access denied',
    );
  });

  it('uses statusText when error field is missing from response', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce('token');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    });

    await expect(fetchWithAuth('https://api.example.com', { method: 'GET' })).rejects.toThrow(
      'Request failed',
    );
  });
});
