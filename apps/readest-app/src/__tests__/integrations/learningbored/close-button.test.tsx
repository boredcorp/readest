import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LearningBoredCloseButton from '@/integrations/learningbored/presentation/LearningBoredCloseButton';

describe('LearningBoredCloseButton', () => {
  it('owns the named close affordance and invokes its callback', () => {
    const onClose = vi.fn();

    render(<LearningBoredCloseButton label='Close study panel' onClose={onClose} />);

    const button = screen.getByRole('button', { name: 'Close study panel' });
    expect(button.getAttribute('title')).toBe('Close study panel');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
