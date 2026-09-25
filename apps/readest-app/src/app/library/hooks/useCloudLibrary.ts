import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useLibraryStore } from '@/store/libraryStore';
import type { AppService } from '@/types/system';
import {
  assertCloudLease,
  captureCloudLease,
  cloudSessionEpoch,
  hasCloudSession,
  subscribeCloudSession,
} from '@/services/cloudOwnerSession';
import { refreshCloudLibrary } from '@/services/ordinaryCloudLibrary';

export function useCloudLibrary({ refreshOnSignIn = false } = {}) {
  const { appService } = useEnv();
  const { user, isReady } = useAuth();
  const subject = user?.id;
  const _ = useTranslation();
  const setLibrary = useLibraryStore((state) => state.setLibrary);
  const ownerEpoch = useSyncExternalStore(subscribeCloudSession, cloudSessionEpoch, () => 0);
  const enabled = Boolean(
    appService?.appPlatform === 'web' && isReady && subject && hasCloudSession(),
  );
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<symbol | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const lifecycle = useRef(0);
  const refreshedOwner = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      active.current = null;
      refreshedOwner.current = null;
    };
  }, []);

  useEffect(() => {
    lifecycle.current += 1;
    active.current = null;
    queue.current = Promise.resolve();
    setIsWorking(false);
    setError(null);
  }, [ownerEpoch, subject]);

  const runAction = useCallback(
    (action: (app: AppService) => Promise<void>, failureMessage: string): Promise<boolean> => {
      if (!enabled || !appService || !subject) return Promise.resolve(false);
      const requestedEpoch = cloudSessionEpoch();
      const requestedLifecycle = lifecycle.current;
      const execute = async (): Promise<boolean> => {
        if (
          !mounted.current ||
          requestedEpoch !== cloudSessionEpoch() ||
          requestedLifecycle !== lifecycle.current
        )
          return false;
        const operation = Symbol('cloud-library-action');
        active.current = operation;
        const isCurrent = () =>
          mounted.current &&
          active.current === operation &&
          cloudSessionEpoch() === requestedEpoch &&
          requestedLifecycle === lifecycle.current;
        setIsWorking(true);
        setError(null);
        try {
          const lease = await captureCloudLease();
          if (!isCurrent() || lease.subject !== subject) return false;
          let succeeded = false;
          try {
            await action(appService);
            assertCloudLease(lease);
            succeeded = true;
          } finally {
            // Failed remote operations may have saved a pending journal. Expose that
            // state, but never publish an old owner's projection after an await.
            assertCloudLease(lease);
            const books = await appService.loadLibraryBooks();
            assertCloudLease(lease);
            if (isCurrent()) setLibrary(books);
          }
          return isCurrent() && succeeded;
        } catch {
          if (isCurrent()) setError(failureMessage);
          return false;
        } finally {
          if (isCurrent()) {
            active.current = null;
            setIsWorking(false);
          }
        }
      };
      // The bookshelf issues bulk actions concurrently. Serialize their projection
      // reloads so every selected cloud download is removed without stale snapshots.
      const completion = queue.current.then(execute, execute);
      queue.current = completion.then(
        () => undefined,
        () => undefined,
      );
      return completion;
    },
    [appService, enabled, setLibrary, subject],
  );

  const refresh = useCallback(
    (manual = true) =>
      runAction(
        (app) => refreshCloudLibrary(app, { pushChanges: manual }),
        _('Could not refresh the cloud library. Try again.'),
      ),
    [_, runAction],
  );

  useEffect(() => {
    if (!refreshOnSignIn || !enabled || refreshedOwner.current === ownerEpoch) return;
    refreshedOwner.current = ownerEpoch;
    void refresh(false);
  }, [enabled, ownerEpoch, refresh, refreshOnSignIn]);

  return { appService, enabled, ownerEpoch, isWorking, error, runAction, refresh };
}
