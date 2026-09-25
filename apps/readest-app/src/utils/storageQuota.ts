import { getStoragePlanData, STORAGE_QUOTA_GRACE_BYTES } from '@/utils/access';

// Call only after validating the token. A configured fixed profile is an exact
// cap; upstream plans retain their purchased quota and historical grace.
export function getStorageReservationQuota(token: string) {
  const configured = process.env['NEXT_PUBLIC_STORAGE_FIXED_QUOTA'] ?? '0';
  if (!/^\d+$/.test(configured)) throw new Error('Invalid storage quota configuration');
  const fixed = Number(configured);
  if (!Number.isSafeInteger(fixed)) throw new Error('Invalid storage quota configuration');
  const quota = fixed || getStoragePlanData(token).quota;
  const reservationLimit = fixed || quota + STORAGE_QUOTA_GRACE_BYTES;
  if (!Number.isSafeInteger(quota) || quota <= 0 || !Number.isSafeInteger(reservationLimit)) {
    throw new Error('Invalid storage quota configuration');
  }
  return { quota, reservationLimit };
}
