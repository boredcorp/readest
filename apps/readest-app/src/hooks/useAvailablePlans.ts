import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBillingAccount,
  fetchBillingCatalog,
  type BillingAccountResponse,
  type BillingCatalogItem,
} from '@/libs/payment/stripe/client';
import { stubTranslation as _ } from '@/utils/misc';

interface UseAvailablePlansParams {
  enabled: boolean;
  identityKey: string | null;
  onError?: (message: string) => void;
}

export const useAvailablePlans = ({ enabled, identityKey, onError }: UseAvailablePlansParams) => {
  const [availablePlans, setAvailablePlans] = useState<BillingCatalogItem[]>([]);
  const [billingAccount, setBillingAccount] = useState<BillingAccountResponse | null>(null);
  const [loadedIdentityKey, setLoadedIdentityKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestSequence = useRef(0);
  const snapshotIdentityKey = useRef<string | null>(null);
  const activeIdentityKey = enabled ? identityKey?.trim() || null : null;

  const refreshBilling = useCallback(async () => {
    if (!activeIdentityKey) return;

    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);

    try {
      const [catalog, account] = await Promise.all([fetchBillingCatalog(), fetchBillingAccount()]);
      if (requestId !== requestSequence.current) return;
      setAvailablePlans(catalog.items);
      setBillingAccount(account);
      setLoadedIdentityKey(activeIdentityKey);
      snapshotIdentityKey.current = activeIdentityKey;
    } catch (caughtError) {
      if (requestId !== requestSequence.current) return;
      const nextError = caughtError instanceof Error ? caughtError : new Error('Unknown error');
      if (snapshotIdentityKey.current !== activeIdentityKey) {
        setAvailablePlans([]);
        setBillingAccount(null);
        setLoadedIdentityKey(activeIdentityKey);
      }
      setError(nextError);
      console.error('Failed to load StoryBored billing:', nextError);
      onError?.(_('Failed to load billing details.'));
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [activeIdentityKey, onError]);

  useEffect(() => {
    requestSequence.current += 1;
    setAvailablePlans([]);
    setBillingAccount(null);
    setLoadedIdentityKey(null);
    snapshotIdentityKey.current = null;
    setError(null);

    if (!activeIdentityKey) {
      setLoading(false);
      return;
    }

    void refreshBilling();
    return () => {
      requestSequence.current += 1;
    };
  }, [activeIdentityKey, refreshBilling]);

  const hasCurrentIdentity = activeIdentityKey !== null && loadedIdentityKey === activeIdentityKey;

  return {
    availablePlans: hasCurrentIdentity ? availablePlans : [],
    billingAccount: hasCurrentIdentity ? billingAccount : null,
    loading: activeIdentityKey !== null && (loading || !hasCurrentIdentity),
    error: hasCurrentIdentity ? error : null,
    refreshBilling,
  };
};
