import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudLibrary } from '@/app/library/hooks/useCloudLibrary';

const mocks = vi.hoisted(() => ({
  epoch: 1,
  user: { id: 'owner-A' },
  listeners: new Set<() => void>(),
  setLibrary: vi.fn(),
  refresh: vi.fn(),
  app: { appPlatform: 'web', loadLibraryBooks: vi.fn() },
}));
const translate = (text: string) => text;
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => translate }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, isReady: true }) }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: mocks.app }) }));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (select: (state: { setLibrary: typeof mocks.setLibrary }) => unknown) =>
    select({ setLibrary: mocks.setLibrary }),
}));
vi.mock('@/services/ordinaryCloudLibrary', () => ({ refreshCloudLibrary: mocks.refresh }));
vi.mock('@/services/cloudOwnerSession', () => ({
  cloudSessionEpoch: () => mocks.epoch,
  hasCloudSession: () => true,
  subscribeCloudSession: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
  captureCloudLease: async () => ({ epoch: mocks.epoch, subject: mocks.user.id }),
  assertCloudLease: (lease: { epoch: number }) => {
    if (lease.epoch !== mocks.epoch) throw new DOMException('Account changed', 'AbortError');
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.epoch = 1;
  mocks.user = { id: 'owner-A' };
  mocks.app.loadLibraryBooks.mockResolvedValue([]);
  mocks.refresh.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('cloud library UI ownership', () => {
  it('runs every concurrent bulk action in order', async () => {
    const calls: number[] = [];
    const { result } = renderHook(() => useCloudLibrary());
    await act(async () => {
      const results = await Promise.all(
        [1, 2, 3].map((number) =>
          result.current.runAction(async () => {
            calls.push(number);
          }, 'Could not remove download'),
        ),
      );
      expect(results).toEqual([true, true, true]);
    });
    expect(calls).toEqual([1, 2, 3]);
    expect(mocks.setLibrary).toHaveBeenCalledTimes(3);
  });

  it('pulls on sign-in without pushing pending changes', async () => {
    renderHook(() => useCloudLibrary({ refreshOnSignIn: true }));
    await waitFor(() =>
      expect(mocks.refresh).toHaveBeenCalledWith(mocks.app, { pushChanges: false }),
    );
  });

  it('reloads a failed partial operation and shows only the supplied safe error', async () => {
    const pending = [{ hash: '1'.repeat(32), cloudOperation: 'delete_pending' }];
    mocks.app.loadLibraryBooks.mockResolvedValue(pending);
    const { result } = renderHook(() => useCloudLibrary());
    await act(async () => {
      const succeeded = await result.current.runAction(async () => {
        throw new Error('signed-url-and-private-token');
      }, 'Cloud deletion did not finish. Retry to finish.');
      expect(succeeded).toBe(false);
    });
    expect(mocks.setLibrary).toHaveBeenCalledWith(pending);
    expect(result.current.error).toBe('Cloud deletion did not finish. Retry to finish.');
  });

  it('discards late owner-A results and errors after switching to owner B', async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const action = vi.fn(() => pending);
    const { result } = renderHook(() => useCloudLibrary());
    let completion: Promise<boolean> = Promise.resolve(false);
    act(() => {
      completion = result.current.runAction(action, 'Old owner error');
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    act(() => {
      mocks.epoch = 2;
      mocks.user = { id: 'owner-B' };
      mocks.listeners.forEach((listener) => listener());
    });
    await act(async () => {
      finish();
      expect(await completion).toBe(false);
    });
    expect(mocks.app.loadLibraryBooks).not.toHaveBeenCalled();
    expect(mocks.setLibrary).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });
});
