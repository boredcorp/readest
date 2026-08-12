import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLearningBoredPoller } from '@/integrations/learningbored/polling';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('LearningBored generation polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits two seconds and never overlaps an in-flight request', async () => {
    vi.useFakeTimers();
    const first = deferred<{ terminal: boolean }>();
    const request = vi.fn(() => first.promise);
    const onResult = vi.fn((result: { terminal: boolean }) => !result.terminal);
    const poller = startLearningBoredPoller({ request, onResult });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(request).toHaveBeenCalledTimes(1);

    first.resolve({ terminal: false });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it('stops after a terminal result and aborts an active request on cleanup', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const request = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve({ terminal: true });
    });
    const poller = startLearningBoredPoller({
      request,
      onResult: (result) => !result.terminal,
      runImmediately: true,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(request).toHaveBeenCalledTimes(1);

    poller.stop();
    expect(signals[0]?.aborted).toBe(false);

    const pending = deferred<void>();
    const active = startLearningBoredPoller({
      request: (signal) => {
        signals.push(signal);
        return pending.promise;
      },
      onResult: () => true,
      runImmediately: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    active.stop();
    expect(signals[1]?.aborted).toBe(true);
  });

  it('recovers from a transient error without overlapping requests or shortening the interval', async () => {
    vi.useFakeTimers();
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const second = deferred<{ terminal: boolean }>();
    const request = vi
      .fn<() => Promise<{ terminal: boolean }>>()
      .mockImplementationOnce(async () => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        activeRequests -= 1;
        throw new Error('temporary transport failure');
      })
      .mockImplementationOnce(async () => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        const result = await second.promise;
        activeRequests -= 1;
        return result;
      });
    const onError = vi.fn();
    const poller = startLearningBoredPoller({
      request,
      onResult: (result) => !result.terminal,
      onError,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'temporary transport failure' }),
    );
    expect(request).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(maximumActiveRequests).toBe(1);

    second.resolve({ terminal: true });
    await Promise.resolve();
    poller.stop();
  });
});
