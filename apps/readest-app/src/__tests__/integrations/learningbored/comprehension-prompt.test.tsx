import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (message: string) => message,
}));

import LearningBoredComprehensionPrompt from '@/integrations/learningbored/LearningBoredComprehensionPrompt';
import type { LearningBoredClient } from '@/integrations/learningbored/client';

afterEach(() => cleanup());

describe('LearningBored comprehension prompt', () => {
  it('asks an unanswered Board once and replaces the question with its persisted answer', async () => {
    let resolveSubmission!: (value: {
      boardId: string;
      passageId: string;
      status: 'answered';
      outcome: 'breakthrough';
      feedbackId: string;
      respondedAt: string;
    }) => void;
    const submission = new Promise<Parameters<typeof resolveSubmission>[0]>((resolve) => {
      resolveSubmission = resolve;
    });
    const submitBoardComprehension = vi.fn<LearningBoredClient['submitBoardComprehension']>(
      () => submission,
    );
    const client = {
      getBoardComprehension: vi.fn(async () => ({
        boardId: 'board-1',
        passageId: 'passage-1',
        status: 'unanswered' as const,
        outcome: null,
        feedbackId: null,
        respondedAt: null,
      })),
      submitBoardComprehension,
    } as unknown as LearningBoredClient;

    render(<LearningBoredComprehensionPrompt boardId='board-1' client={client} />);
    const yes = await screen.findByRole('button', { name: 'Yes, I understand it' });
    fireEvent.click(yes);
    fireEvent.click(yes);
    expect(submitBoardComprehension).toHaveBeenCalledTimes(1);
    expect(submitBoardComprehension).toHaveBeenCalledWith(
      'board-1',
      {
        outcome: 'breakthrough',
      },
      { signal: expect.any(AbortSignal) },
    );

    resolveSubmission({
      boardId: 'board-1',
      passageId: 'passage-1',
      status: 'answered',
      outcome: 'breakthrough',
      feedbackId: 'feedback-1',
      respondedAt: '2026-08-03T12:00:00.000Z',
    });
    await waitFor(() =>
      expect(screen.getByText('Thanks — your answer was recorded.')).toBeTruthy(),
    );
    expect(screen.queryByText('Did this Board make the passage click?')).toBeNull();
  });

  it('does not ask again when the persisted response is already answered', async () => {
    const submitBoardComprehension = vi.fn();
    const client = {
      getBoardComprehension: vi.fn(async () => ({
        boardId: 'board-1',
        passageId: 'passage-1',
        status: 'answered' as const,
        outcome: 'still_unclear' as const,
        feedbackId: 'feedback-1',
        respondedAt: '2026-08-03T12:00:00.000Z',
      })),
      submitBoardComprehension,
    } as unknown as LearningBoredClient;

    render(<LearningBoredComprehensionPrompt boardId='board-1' client={client} />);
    expect(await screen.findByText(/Try a different Board kind/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yes, I understand it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'I still don’t get it' })).toBeNull();
    expect(submitBoardComprehension).not.toHaveBeenCalled();
  });

  it('keeps the question available after a failed save', async () => {
    const client = {
      getBoardComprehension: vi.fn(async () => ({
        boardId: 'board-1',
        passageId: 'passage-1',
        status: 'unanswered' as const,
        outcome: null,
        feedbackId: null,
        respondedAt: null,
      })),
      submitBoardComprehension: vi.fn(async () => {
        throw new Error('offline');
      }),
    } as unknown as LearningBoredClient;

    render(<LearningBoredComprehensionPrompt boardId='board-1' client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'I still don’t get it' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your answer could not be saved. Please try again.',
    );
    expect(screen.getByRole('button', { name: 'I still don’t get it' })).toBeTruthy();
  });

  it('ignores a stale load after moving to another Board', async () => {
    let resolveFirstLoad!: (value: {
      boardId: string;
      passageId: string;
      status: 'answered';
      outcome: 'breakthrough';
      feedbackId: string;
      respondedAt: string;
    }) => void;
    const firstLoad = new Promise<Parameters<typeof resolveFirstLoad>[0]>((resolve) => {
      resolveFirstLoad = resolve;
    });
    const getBoardComprehension = vi.fn((boardId: string) =>
      boardId === 'board-1'
        ? firstLoad
        : Promise.resolve({
            boardId: 'board-2',
            passageId: 'passage-2',
            status: 'unanswered' as const,
            outcome: null,
            feedbackId: null,
            respondedAt: null,
          }),
    );
    const client = {
      getBoardComprehension,
      submitBoardComprehension: vi.fn(),
    } as unknown as LearningBoredClient;

    const { rerender } = render(
      <LearningBoredComprehensionPrompt boardId='board-1' client={client} />,
    );
    rerender(<LearningBoredComprehensionPrompt boardId='board-2' client={client} />);
    expect(await screen.findByRole('button', { name: 'Yes, I understand it' })).toBeTruthy();

    await act(async () => {
      resolveFirstLoad({
        boardId: 'board-1',
        passageId: 'passage-1',
        status: 'answered',
        outcome: 'breakthrough',
        feedbackId: 'feedback-1',
        respondedAt: '2026-08-03T12:00:00.000Z',
      });
      await firstLoad;
    });

    expect(screen.getByRole('button', { name: 'Yes, I understand it' })).toBeTruthy();
    expect(screen.queryByText('Thanks — your answer was recorded.')).toBeNull();
  });

  it('ignores an in-flight submission after moving to another Board', async () => {
    let resolveSubmission!: (value: {
      boardId: string;
      passageId: string;
      status: 'answered';
      outcome: 'breakthrough';
      feedbackId: string;
      respondedAt: string;
    }) => void;
    const submission = new Promise<Parameters<typeof resolveSubmission>[0]>((resolve) => {
      resolveSubmission = resolve;
    });
    const submitBoardComprehension = vi.fn<LearningBoredClient['submitBoardComprehension']>(
      () => submission,
    );
    const client = {
      getBoardComprehension: vi.fn(async (boardId: string) => ({
        boardId,
        passageId: boardId === 'board-1' ? 'passage-1' : 'passage-2',
        status: 'unanswered' as const,
        outcome: null,
        feedbackId: null,
        respondedAt: null,
      })),
      submitBoardComprehension,
    } as unknown as LearningBoredClient;

    const { rerender } = render(
      <LearningBoredComprehensionPrompt boardId='board-1' client={client} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, I understand it' }));
    const submissionSignal = (
      submitBoardComprehension.mock.calls[0]?.[2] as { signal?: AbortSignal } | undefined
    )?.signal;

    rerender(<LearningBoredComprehensionPrompt boardId='board-2' client={client} />);
    expect(await screen.findByRole('button', { name: 'Yes, I understand it' })).toBeTruthy();
    expect(submissionSignal?.aborted).toBe(true);

    await act(async () => {
      resolveSubmission({
        boardId: 'board-1',
        passageId: 'passage-1',
        status: 'answered',
        outcome: 'breakthrough',
        feedbackId: 'feedback-1',
        respondedAt: '2026-08-03T12:00:00.000Z',
      });
      await submission;
    });

    expect(screen.getByRole('button', { name: 'Yes, I understand it' })).toBeTruthy();
    expect(screen.queryByText('Thanks — your answer was recorded.')).toBeNull();
  });
});
