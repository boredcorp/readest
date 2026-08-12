import { ShieldCheck } from 'lucide-react';

import type { LearningBoredTranslationFunc } from '../presentation/context';
import { formatLearningBoredCopy } from '../presentation/context';

import styles from './LearningBoredWorkSurface.module.css';

export interface DroppedClaimsNoticeProps {
  count: number;
  translate?: LearningBoredTranslationFunc;
}

export default function DroppedClaimsNotice({
  count,
  translate = formatLearningBoredCopy,
}: DroppedClaimsNoticeProps) {
  if (count <= 0) return null;

  const copy =
    count === 1
      ? translate('One claim was dropped because the passage did not support it.')
      : count === 2
        ? translate('Two claims were dropped because the passage did not support them.')
        : translate('{{count}} claims were dropped because the passage did not support them.', {
            count,
          });

  return (
    <p className={styles['droppedNotice']} role='status'>
      <ShieldCheck aria-hidden='true' />
      <span>{copy}</span>
    </p>
  );
}
