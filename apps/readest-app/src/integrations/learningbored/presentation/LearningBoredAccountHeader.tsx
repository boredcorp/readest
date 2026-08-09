'use client';

import ProfileHeader from '@/app/user/components/Header';

import styles from './learningbored-account.module.css';

export default function LearningBoredAccountHeader({
  onBack,
  safeAreaTop,
}: {
  onBack: () => void;
  safeAreaTop: number;
}) {
  return (
    <ProfileHeader
      onGoBack={onBack}
      fixed={false}
      className={styles['profileHeader']}
      buttonClassName={styles['backButton']}
      iconClassName={styles['backIcon']}
      style={{ marginTop: safeAreaTop }}
      title={<span className={styles['headerWordmark']}>LearningBored</span>}
    />
  );
}
