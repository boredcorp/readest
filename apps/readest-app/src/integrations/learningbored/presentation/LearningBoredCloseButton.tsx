'use client';

import { X } from 'lucide-react';

import styles from './LearningBoredCloseButton.module.css';

export interface LearningBoredCloseButtonProps {
  label: string;
  onClose: () => void;
}

export default function LearningBoredCloseButton({
  label,
  onClose,
}: LearningBoredCloseButtonProps) {
  return (
    <button
      aria-label={label}
      className={styles['button']}
      onClick={onClose}
      title={label}
      type='button'
    >
      <X aria-hidden='true' />
    </button>
  );
}
