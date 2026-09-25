import { useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';

export const useProgressAutoSave = (bookKey: string) => {
  const { envConfig } = useEnv();
  const progress = useReaderStore((state) => state.getProgress(bookKey));
  const viewId = useBookDataStore((state) => state.getBookData(bookKey)?.viewId);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const store = useBookDataStore.getState();
      const data = store.getBookData(bookKey);
      if (!data?.config || data.viewId !== viewId) return;
      try {
        await store.saveConfig(
          envConfig,
          bookKey,
          data.config,
          useSettingsStore.getState().settings,
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          console.error('Unable to save reading progress');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [bookKey, envConfig, progress, viewId]);
};
