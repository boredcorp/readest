import { describe, expect, test } from 'vitest';
import { GET } from '@/app/health/live/route';

describe('Reader liveness route', () => {
  test('returns a dependency-free, non-cacheable health response', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'storybored-reader',
    });
  });
});
