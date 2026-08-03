import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAppRouter } from '@/hooks/useAppRouter';

const transitionRouter = {
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
};
const plainRouter = {
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
};

vi.mock('next-view-transitions', () => ({
  useTransitionRouter: () => transitionRouter,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => plainRouter,
}));

const useEnvMock = vi.fn();
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => useEnvMock(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAppRouter', () => {
  it.each(['/reader?ids=book-id', '/reader/book-id'])(
    'opens the reader without a View Transition for %s',
    (href) => {
      useEnvMock.mockReturnValue({ appService: { isLinuxApp: false } });
      const { result } = renderHook(() => useAppRouter());

      result.current.push(href, { scroll: false });
      result.current.replace(href, { scroll: false });

      expect(plainRouter.push).toHaveBeenCalledWith(href, { scroll: false });
      expect(plainRouter.replace).toHaveBeenCalledWith(href, { scroll: false });
      expect(transitionRouter.push).not.toHaveBeenCalled();
      expect(transitionRouter.replace).not.toHaveBeenCalled();
    },
  );

  it('keeps View Transitions for lightweight routes', () => {
    useEnvMock.mockReturnValue({ appService: { isLinuxApp: false } });
    const { result } = renderHook(() => useAppRouter());

    result.current.push('/auth');
    result.current.replace('/library?group=fiction');

    expect(transitionRouter.push).toHaveBeenCalledWith('/auth', undefined);
    expect(transitionRouter.replace).toHaveBeenCalledWith('/library?group=fiction', undefined);
    expect(plainRouter.push).not.toHaveBeenCalled();
    expect(plainRouter.replace).not.toHaveBeenCalled();
  });

  it('uses the plain router for every route on Linux', () => {
    useEnvMock.mockReturnValue({ appService: { isLinuxApp: true } });
    const { result } = renderHook(() => useAppRouter());

    expect(result.current).toBe(plainRouter);
  });
});
