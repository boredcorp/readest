import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import { useTranslation } from '@/hooks/useTranslation';
import { useAppRouter } from '@/hooks/useAppRouter';
import { useLibraryStore } from '@/store/libraryStore';
import { navigateToReader } from '@/utils/nav';
import { useCloudLibrary } from '@/app/library/hooks/useCloudLibrary';
import { cloudSessionEpoch } from '@/services/cloudOwnerSession';
import {
  isLegacyUnownedCloudBook,
  isOrdinaryCloudBook,
  type CloudEntry,
} from '@/services/cloudLibraryModel';
import {
  chooseCloudLibraryCopy,
  deleteOrdinaryCloudBook,
  getCloudBookState,
  hasLocalLibraryCopy,
  removeCloudDownload,
  retryCloudBook,
  uploadOrdinaryBook,
} from '@/services/ordinaryCloudLibrary';

export default function CloudLibraryActions({ book }: { book: Book }) {
  const _ = useTranslation();
  const router = useAppRouter();
  const { appService, enabled, ownerEpoch, isWorking, error, runAction } = useCloudLibrary();
  const library = useLibraryStore((state) => state.library);
  const [entry, setEntry] = useState<CloudEntry | null>(null);
  const [hasLocalCopy, setHasLocalCopy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const readVersion = useRef(0);
  const ordinary = isOrdinaryCloudBook(book) && !isLegacyUnownedCloudBook(book);
  const isCloud = book.libraryOrigin?.kind === 'cloud';
  const currentOrigin =
    book.libraryOrigin?.kind !== 'cloud' || book.libraryOrigin.epoch === ownerEpoch;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setConfirmDelete(false);
    setMessage(null);
  }, [book.hash, ownerEpoch]);

  const readState = useCallback(async () => {
    if (!enabled || !appService || !ordinary || !currentOrigin) return;
    const epoch = cloudSessionEpoch();
    const version = ++readVersion.current;
    const isCurrent = () =>
      mounted.current && epoch === cloudSessionEpoch() && version === readVersion.current;
    try {
      const [nextEntry, localCopy] = await Promise.all([
        getCloudBookState(appService, book.hash),
        hasLocalLibraryCopy(appService, book.hash),
      ]);
      if (!isCurrent()) return;
      setEntry(nextEntry);
      setHasLocalCopy(localCopy);
      setReadError(false);
      setLoaded(true);
    } catch {
      if (!isCurrent()) return;
      setReadError(true);
      setLoaded(false);
    }
  }, [appService, book.hash, currentOrigin, enabled, ordinary]);

  useEffect(() => {
    setLoaded(false);
    setEntry(null);
    setReadError(false);
    void readState();
    return () => {
      readVersion.current += 1;
    };
  }, [readState, ownerEpoch, library]);

  const perform = async (
    action: (app: AppService) => Promise<void>,
    failure: string,
    success?: string,
  ) => {
    const epoch = cloudSessionEpoch();
    setMessage(null);
    const completed = await runAction(action, failure);
    if (!mounted.current || epoch !== cloudSessionEpoch()) return false;
    await readState();
    if (!mounted.current || epoch !== cloudSessionEpoch()) return false;
    if (completed && success) setMessage(success);
    return completed;
  };

  const openCopy = async (cloud: boolean) => {
    const epoch = cloudSessionEpoch();
    const completed = await perform(async (app) => {
      const selected = await chooseCloudLibraryCopy(app, book.hash, cloud);
      if (!selected || (selected.libraryOrigin?.kind === 'cloud') !== cloud) {
        throw new Error('Requested copy is unavailable');
      }
    }, _('Could not open this copy. Refresh the cloud library and try again.'));
    if (completed && epoch === cloudSessionEpoch()) navigateToReader(router, [book.hash]);
  };

  if (!ordinary || !currentOrigin || appService?.appPlatform !== 'web') return null;

  const pendingDelete = entry?.state === 'delete_pending';
  const pendingUpload = entry?.state === 'upload_pending' || entry?.state === 'metadata_pending';
  const available = entry?.state === 'ready' && !entry.book.deletedAt;
  const disabled = !enabled || !loaded || isWorking;

  return (
    <section aria-label={_('Cloud library')} className='border-base-300 mb-4 rounded-lg border p-4'>
      <h3 className='mb-2 font-semibold'>{_('Cloud library')}</h3>
      <div role='status' aria-live='polite' className='text-neutral-content text-sm'>
        {!enabled
          ? _('Sign in to use your cloud library.')
          : readError
            ? _('Could not read cloud library details. Try again.')
            : !loaded
              ? _('Checking cloud library…')
              : pendingDelete
                ? _('Cloud deletion is pending. Retry to finish.')
                : pendingUpload
                  ? _('Cloud upload or metadata confirmation is pending. Retry to finish.')
                  : available
                    ? _('Available in cloud library')
                    : entry?.state === 'tombstoned'
                      ? _('Removed from cloud library')
                      : _('This book is stored on this device.')}
      </div>
      {enabled && (
        <div className='mt-3 flex flex-wrap gap-2'>
          {readError && (
            <button type='button' className='btn btn-sm' onClick={() => void readState()}>
              {_('Retry')}
            </button>
          )}
          {loaded && (!entry || entry.state === 'tombstoned') && !isCloud && (
            <button
              type='button'
              className='btn btn-sm btn-primary'
              disabled={disabled}
              onClick={() =>
                void perform(
                  (app) => uploadOrdinaryBook(app, book),
                  _(
                    'Upload did not finish. Your local book is unchanged; retry to finish the cloud copy.',
                  ),
                )
              }
            >
              {_('Upload to cloud library')}
            </button>
          )}
          {pendingUpload && (
            <button
              type='button'
              className='btn btn-sm btn-primary'
              disabled={disabled}
              onClick={() =>
                void perform(
                  (app) => retryCloudBook(app, book),
                  _('Cloud upload or metadata confirmation did not finish. Retry when ready.'),
                )
              }
            >
              {entry?.state === 'upload_pending'
                ? _('Retry cloud upload')
                : _('Retry cloud confirmation')}
            </button>
          )}
          {available && !isCloud && (
            <button
              type='button'
              className='btn btn-sm'
              disabled={disabled}
              onClick={() => void openCopy(true)}
            >
              {_('Open cloud copy')}
            </button>
          )}
          {isCloud && hasLocalCopy && (
            <button
              type='button'
              className='btn btn-sm'
              disabled={disabled}
              onClick={() => void openCopy(false)}
            >
              {_('Open local copy')}
            </button>
          )}
          {isCloud && available && entry.book.downloadedAt && (
            <button
              type='button'
              className='btn btn-sm'
              disabled={disabled}
              onClick={() =>
                void perform(
                  (app) => removeCloudDownload(app, book),
                  _('Could not remove the downloaded cloud copy. Try again.'),
                  _('Downloaded copy removed. The book remains in your cloud library.'),
                )
              }
            >
              {_('Remove downloaded cloud copy')}
            </button>
          )}
          {(available || pendingDelete) && (
            <button
              type='button'
              className='btn btn-sm btn-outline text-error'
              disabled={disabled}
              onClick={() => setConfirmDelete(true)}
            >
              {pendingDelete ? _('Retry cloud deletion') : _('Delete from cloud library')}
            </button>
          )}
        </div>
      )}
      {confirmDelete && enabled && (
        <div
          role='group'
          aria-label={_('Confirm cloud deletion')}
          className='bg-base-200 mt-3 rounded-lg p-3'
        >
          <p className='text-sm'>
            {_(
              'Delete this account’s cloud file, cloud library entry and downloaded cloud copy? A separate local copy remains.',
            )}
          </p>
          <div className='mt-3 flex flex-wrap gap-2'>
            <button
              type='button'
              className='btn btn-sm btn-error'
              disabled={isWorking}
              onClick={() => {
                setConfirmDelete(false);
                void perform(
                  (app) => deleteOrdinaryCloudBook(app, book),
                  _(
                    'Cloud deletion did not finish. Refresh to check its status before trying again.',
                  ),
                  _('The book was removed from your cloud library.'),
                );
              }}
            >
              {_('Confirm cloud deletion')}
            </button>
            <button
              type='button'
              className='btn btn-sm'
              disabled={isWorking}
              onClick={() => setConfirmDelete(false)}
            >
              {_('Cancel')}
            </button>
          </div>
        </div>
      )}
      {isWorking && (
        <p role='status' className='mt-2 text-sm'>
          {_('Updating cloud library…')}
        </p>
      )}
      {error && (
        <p role='alert' className='text-error mt-2 text-sm'>
          {error}
        </p>
      )}
      {message && (
        <p role='status' className='mt-2 text-sm'>
          {message}
        </p>
      )}
    </section>
  );
}
