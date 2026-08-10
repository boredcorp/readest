import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/cors', () => ({
  corsAllMethods: () => undefined,
  runMiddleware: async () => undefined,
}));

import handler from '@/pages/api/user/delete';

function responseRecorder() {
  let statusCode: number | undefined;
  let payload: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      payload = body;
      return response;
    },
  } as unknown as NextApiResponse;

  return {
    response,
    get payload() {
      return payload;
    },
    get statusCode() {
      return statusCode;
    },
  };
}

describe('legacy Reader account-deletion endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://storybored.example');
  });

  it('cannot bypass coordinated StoryBored deletion', async () => {
    const recorder = responseRecorder();

    await handler({ method: 'DELETE' } as unknown as NextApiRequest, recorder.response);

    expect(recorder.statusCode).toBe(410);
    expect(recorder.payload).toEqual({
      error: 'Account deletion is managed by StoryBored.',
      accountUrl: 'https://storybored.example/account',
    });
  });

  it('continues to reject unsupported methods', async () => {
    const recorder = responseRecorder();

    await handler({ method: 'POST' } as unknown as NextApiRequest, recorder.response);

    expect(recorder.statusCode).toBe(405);
    expect(recorder.payload).toEqual({ error: 'Method not allowed' });
  });
});
