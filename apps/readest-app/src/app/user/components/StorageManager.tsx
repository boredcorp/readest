'use client';

import clsx from 'clsx';
import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  assertCloudLease,
  captureCloudLease,
  cloudSessionEpoch,
  hasCloudSession,
  subscribeCloudSession,
  type CloudLease,
} from '@/services/cloudOwnerSession';
import { isOrdinaryCloudBook } from '@/services/cloudLibraryModel';
import { deleteOrdinaryCloudBook, getCloudBookState } from '@/services/ordinaryCloudLibrary';
import type { Book } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useLibrary } from '@/hooks/useLibrary';
import {
  listFiles,
  getStorageStats,
  purgeFiles,
  type FileRecord,
  type StorageStats,
  type ListFilesParams,
} from '@/libs/storage';
import { eventDispatcher } from '@/utils/event';
import { debounce } from '@/utils/debounce';
import { getRemoteBookFilename } from '@/utils/book';
import { CLOUD_BOOKS_SUBDIR } from '@/services/constants';
import Spinner from '@/components/Spinner';
import Alert from '@/components/Alert';

type StorageDeletionPlan = {
  lease: CloudLease;
  books: Book[];
  files: FileRecord[];
  rawKeys: string[];
};

const StorageManager = () => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { libraryLoaded } = useLibrary();
  const { safeAreaInsets } = useThemeStore();
  const ownerEpoch = useSyncExternalStore(subscribeCloudSession, cloudSessionEpoch, () => 0);
  const [loading, setLoading] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<ListFilesParams['sortBy']>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deletionPlan, setDeletionPlan] = useState<StorageDeletionPlan | null>(null);
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());

  const loadFiles = useCallback(async () => {
    if (!hasCloudSession()) return;
    setLoading(true);
    try {
      const lease = await captureCloudLease();
      if (lease.epoch !== ownerEpoch) return;
      const params: ListFilesParams = {
        page: currentPage,
        pageSize: 20,
        sortBy,
        sortOrder,
      };

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const response = await listFiles(params, lease);
      assertCloudLease(lease);
      setFiles(response.files);
      setTotalPages(response.totalPages);
      setFilesLoaded(true);
    } catch (error) {
      if (ownerEpoch !== cloudSessionEpoch()) return;
      console.error('Failed to load files:', error);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to load files'),
      });
    } finally {
      if (ownerEpoch === cloudSessionEpoch()) setLoading(false);
    }
  }, [currentPage, sortBy, sortOrder, searchQuery, _, ownerEpoch]);

  const loadStats = useCallback(async () => {
    if (!hasCloudSession()) return;
    setLoading(true);
    try {
      const lease = await captureCloudLease();
      if (lease.epoch !== ownerEpoch) return;
      const statsData = await getStorageStats(lease);
      assertCloudLease(lease);
      setStats(statsData);
    } catch (error) {
      if (ownerEpoch !== cloudSessionEpoch()) return;
      console.error('Failed to load stats:', error);
    } finally {
      if (ownerEpoch === cloudSessionEpoch()) setLoading(false);
    }
  }, [ownerEpoch]);

  useEffect(() => {
    setFiles([]);
    setStats(null);
    setFilesLoaded(false);
    setSelectedFiles(new Set());
    setExpandedBooks(new Set());
    setShowConfirmDelete(false);
    setDeletionPlan(null);
    setLoading(false);
  }, [ownerEpoch]);

  useEffect(() => {
    loadFiles();
    loadStats();
  }, [loadFiles, loadStats]);

  // Group files by book_hash
  const groupedFiles = React.useMemo(() => {
    const groups = new Map<string, FileRecord[]>();

    files.forEach((file) => {
      const bookHash = file.book_hash || 'no-book';
      if (!groups.has(bookHash)) {
        groups.set(bookHash, []);
      }
      groups.get(bookHash)!.push(file);
    });

    return groups;
  }, [files]);

  const getFileName = (fileKey: string): string => {
    const parts = fileKey.split('/');
    return parts[parts.length - 1] || fileKey;
  };

  const isCoverFile = (file: FileRecord): boolean => {
    return getFileName(file.file_key).toLowerCase() === 'cover.png';
  };

  // Get main book file (first non-cover file)
  const getMainBookFile = (bookFiles: FileRecord[]): FileRecord | null => {
    return bookFiles.find((f) => !isCoverFile(f)) || bookFiles[0] || null;
  };

  // Get all files for a book including covers
  const getAllBookFiles = (bookFiles: FileRecord[]): FileRecord[] => {
    return bookFiles;
  };

  const toggleBookExpansion = (bookHash: string) => {
    const newExpanded = new Set(expandedBooks);
    if (newExpanded.has(bookHash)) {
      newExpanded.delete(bookHash);
    } else {
      newExpanded.add(bookHash);
    }
    setExpandedBooks(newExpanded);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFiles(new Set(files.map((f) => f.file_key)));
    } else {
      setSelectedFiles(new Set());
    }
  };

  const handleSelectBook = (bookFiles: FileRecord[], checked: boolean) => {
    const newSelected = new Set(selectedFiles);
    const allBookFiles = getAllBookFiles(bookFiles);

    allBookFiles.forEach((file) => {
      if (checked) {
        newSelected.add(file.file_key);
      } else {
        newSelected.delete(file.file_key);
      }
    });

    setSelectedFiles(newSelected);
  };

  const handleSelectFile = (fileKey: string, checked: boolean) => {
    const newSelected = new Set(selectedFiles);
    if (checked) {
      newSelected.add(fileKey);
    } else {
      newSelected.delete(fileKey);
    }
    setSelectedFiles(newSelected);
  };

  const isBookSelected = (bookFiles: FileRecord[]): boolean => {
    const allBookFiles = getAllBookFiles(bookFiles);
    return allBookFiles.length > 0 && allBookFiles.every((f) => selectedFiles.has(f.file_key));
  };

  const isBookPartiallySelected = (bookFiles: FileRecord[]): boolean => {
    const allBookFiles = getAllBookFiles(bookFiles);
    const selectedCount = allBookFiles.filter((f) => selectedFiles.has(f.file_key)).length;
    return selectedCount > 0 && selectedCount < allBookFiles.length;
  };

  const prepareDeletion = async () => {
    if (!appService || !libraryLoaded || !selectedFiles.size) return;
    setLoading(true);
    try {
      const lease = await captureCloudLease();
      if (lease.epoch !== ownerEpoch) return;
      const records = files.filter((file) => selectedFiles.has(file.file_key));
      if (records.length !== selectedFiles.size) throw new Error('Selection changed');
      const books = new Map<string, Book>();
      for (const file of records) {
        if (!file.file_key.startsWith(`${lease.subject}/`)) throw new Error('Owner changed');
        const hash = file.book_hash;
        if (
          !hash ||
          !/^[a-f0-9]{32}$/i.test(hash) ||
          /^0+$/.test(hash) ||
          isCoverFile(file) ||
          !file.file_key.startsWith(`${lease.subject}/${CLOUD_BOOKS_SUBDIR}/${hash}/`)
        )
          continue;
        const visible = useLibraryStore.getState().library.find((book) => book.hash === hash);
        if (visible && !isOrdinaryCloudBook(visible)) continue;
        const entry = await getCloudBookState(appService, hash);
        assertCloudLease(lease);
        if (!entry || !isOrdinaryCloudBook(entry.book))
          throw new Error('Cloud book identity unavailable');
        books.set(hash, {
          ...entry.book,
          libraryOrigin: { kind: 'cloud', ownerKey: lease.ownerKey, epoch: lease.epoch },
        });
      }
      assertCloudLease(lease);
      setDeletionPlan({
        lease,
        books: [...books.values()],
        files: records,
        rawKeys: records
          .filter((file) => !file.book_hash || !books.has(file.book_hash))
          .map((file) => file.file_key),
      });
      setShowConfirmDelete(true);
    } catch {
      if (ownerEpoch === cloudSessionEpoch())
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _(
            'Refresh the cloud library, then delete this book from its book details. No files were deleted.',
          ),
        });
    } finally {
      if (ownerEpoch === cloudSessionEpoch()) setLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!deletionPlan) return;
    if (!libraryLoaded || !appService) return;

    setLoading(true);
    try {
      const { lease, books, files: fileRecords, rawKeys } = deletionPlan;
      assertCloudLease(lease);
      try {
        for (const book of books) {
          assertCloudLease(lease);
          await deleteOrdinaryCloudBook(appService, book);
        }
      } finally {
        if (books.length) {
          assertCloudLease(lease);
          const projected = await appService.loadLibraryBooks();
          assertCloudLease(lease);
          useLibraryStore.getState().setLibrary(projected);
        }
      }
      const result = rawKeys.length
        ? await purgeFiles(rawKeys, true, lease)
        : { success: [], failed: [], deletedCount: 0, failedCount: 0 };
      assertCloudLease(lease);
      const deletedFileKeys = new Set(result.success);

      const { library, setLibrary } = useLibraryStore.getState();
      const changed = library
        .filter((book) => {
          const origin = book.libraryOrigin;
          if (
            origin?.kind !== 'cloud' ||
            origin.ownerKey !== lease.ownerKey ||
            origin.epoch !== lease.epoch
          )
            return false;
          const bookPath = `${CLOUD_BOOKS_SUBDIR}/${getRemoteBookFilename(book)}`;
          return fileRecords.some(
            (file) =>
              file.book_hash === book.hash &&
              deletedFileKeys.has(file.file_key) &&
              file.file_key.slice(file.file_key.indexOf('/') + 1) === bookPath,
          );
        })
        .map((book) => ({ ...book, uploadedAt: null, updatedAt: Date.now() }));
      if (changed.length) {
        const patches = new Map(changed.map((book) => [book.hash, book]));
        setLibrary(library.map((book) => patches.get(book.hash) ?? book));
        await appService.saveLibraryBooks(changed, () => assertCloudLease(lease));
        assertCloudLease(lease);
      }

      if (result.deletedCount > 0 || books.length) {
        await loadFiles();
        assertCloudLease(lease);
        await loadStats();
        assertCloudLease(lease);
        setSelectedFiles(new Set());

        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: books.length
            ? _('The selected cloud books and files were deleted.')
            : _('Deleted {{count}} file(s)', { count: result.deletedCount }),
        });

        if (result.failedCount > 0) {
          eventDispatcher.dispatch('toast', {
            type: 'info',
            message: _('Failed to delete {{count}} file(s)', { count: result.failedCount }),
          });
        }
      }
    } catch (error) {
      if (ownerEpoch !== cloudSessionEpoch()) return;
      console.error('Failed to delete files:', error);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to delete files'),
      });
    } finally {
      if (ownerEpoch === cloudSessionEpoch()) {
        setLoading(false);
        setShowConfirmDelete(false);
        setDeletionPlan(null);
      }
    }
  };

  const handleSearchChange = useMemo(
    () =>
      debounce((value: string) => {
        setSearchQuery(value);
        setCurrentPage(1);
      }, 1000),
    [setSearchQuery, setCurrentPage],
  );

  useEffect(() => {
    handleSearchChange(searchInput);
  }, [searchInput, handleSearchChange]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1e6) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
    const inGB = bytes > 1e9;
    const value = bytes / 1024 / 1024 / (inGB ? 1024 : 1);
    return `${Math.round(value * 10) / 10} ${inGB ? 'GB' : 'MB'}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getBookTotalSize = (bookFiles: FileRecord[]): number => {
    return bookFiles.reduce((sum, file) => sum + file.file_size, 0);
  };

  const isAllSelected = files.length > 0 && selectedFiles.size === files.length;

  return (
    <div className='flex flex-col gap-6'>
      {/* Stats Section */}
      {stats ? (
        <div className='bg-base-100 border-base-300 rounded-lg border p-4'>
          <h3 className='text-base-content mb-4 text-lg font-semibold'>
            {_('Cloud Storage Usage')}
          </h3>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
            <div>
              <div className='text-base-content/60 text-sm'>{_('Total Files')}</div>
              <div className='text-base-content text-xl font-semibold'>{stats.totalFiles}</div>
            </div>
            <div>
              <div className='text-base-content/60 text-sm'>{_('Total Size')}</div>
              <div className='text-base-content text-xl font-semibold'>
                {formatFileSize(stats.totalSize)}
              </div>
            </div>
            <div>
              <div className='text-base-content/60 text-sm'>{_('Quota')}</div>
              <div className='text-base-content text-xl font-semibold'>
                {formatFileSize(stats.quota)}
              </div>
            </div>
            <div>
              <div className='text-base-content/60 text-sm'>{_('Used')}</div>
              <div className='text-base-content text-xl font-semibold'>
                {stats.usagePercentage}%
              </div>
            </div>
          </div>
          <div className='bg-base-300 mt-4 h-2 w-full overflow-hidden rounded-full'>
            <div
              className='bg-primary h-full transition-all'
              style={{ width: `${Math.min(stats.usagePercentage, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className='bg-base-100 border-base-300 rounded-lg border p-4'>
          <div className='skeleton mb-4 h-6 w-32'></div>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
            <div className='skeleton h-16 w-full'></div>
            <div className='skeleton h-16 w-full'></div>
            <div className='skeleton h-16 w-full'></div>
            <div className='skeleton h-16 w-full'></div>
          </div>
          <div className='skeleton mt-4 h-2 w-full rounded-full'></div>
        </div>
      )}

      {/* Files Section */}
      <div className='bg-base-100 border-base-300 rounded-lg border'>
        <div className='border-base-300 flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='hidden items-center justify-center sm:flex'>
            <h3 className='text-base-content text-lg font-semibold'>{_('Files')}</h3>
          </div>

          <div className='flex flex-col gap-2 sm:flex-row'>
            <input
              type='text'
              placeholder={_('Search files...')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className='input input-bordered input-sm w-full sm:w-64'
              disabled={loading}
            />

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-');
                setSortBy(newSortBy as ListFilesParams['sortBy']);
                setSortOrder(newSortOrder as 'asc' | 'desc');
              }}
              disabled={loading}
              className='select select-bordered select-sm'
            >
              <option value='created_at-desc'>{_('Newest First')}</option>
              <option value='created_at-asc'>{_('Oldest First')}</option>
              <option value='file_size-desc'>{_('Largest First')}</option>
              <option value='file_size-asc'>{_('Smallest First')}</option>
              <option value='file_key-asc'>{_('Name A-Z')}</option>
              <option value='file_key-desc'>{_('Name Z-A')}</option>
            </select>
          </div>
        </div>

        {/* Actions Bar */}
        <div className='bg-base-200 border-base-300 flex items-center justify-between border-b p-4'>
          <span className='text-base-content text-sm'>
            {_('{{count}} selected', { count: selectedFiles.size })}
          </span>
          <button
            onClick={() => void prepareDeletion()}
            className='btn btn-error btn-sm'
            disabled={loading || selectedFiles.size === 0}
          >
            {_('Delete Selected')}
          </button>
        </div>

        {loading && <Spinner loading />}

        {/* Files List - Grouped by Book */}
        <div className='w-full'>
          <table className='table-sm table w-full [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1'>
            <thead className='h-10'>
              <tr>
                <th className='w-12'>
                  <div className='flex items-center'>
                    <input
                      type='checkbox'
                      checked={isAllSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className='checkbox checkbox-sm'
                      disabled={!filesLoaded || loading}
                    />
                  </div>
                </th>
                <th className='!ps-0'>{_('File Name')}</th>
                <th className='hidden sm:table-cell'>{_('Size')}</th>
                <th className='hidden sm:table-cell'>{_('Created')}</th>
              </tr>
            </thead>
            <tbody>
              {!filesLoaded ? (
                <>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td className='min-w-16'>
                        <div className='skeleton h-5 w-5'></div>
                      </td>
                      <td className='max-w-0 !ps-0 sm:w-[80%]'>
                        <div className='flex flex-col gap-2'>
                          <div className='skeleton h-4 w-3/4'></div>
                          <div className='skeleton h-3 w-1/2 sm:hidden'></div>
                        </div>
                      </td>
                      <td className='hidden sm:table-cell'>
                        <div className='skeleton h-4 w-16'></div>
                      </td>
                      <td className='hidden sm:table-cell'>
                        <div className='skeleton h-4 w-20'></div>
                      </td>
                    </tr>
                  ))}
                </>
              ) : groupedFiles.size === 0 ? (
                <tr>
                  <td colSpan={4} className='text-center'>
                    <div className='text-base-content/60 py-8'>
                      {searchQuery ? _('No files found') : _('No files uploaded yet')}
                    </div>
                  </td>
                </tr>
              ) : (
                Array.from(groupedFiles.entries()).map(([bookHash, bookFiles]) => {
                  const mainFile = getMainBookFile(bookFiles);
                  const isExpanded = expandedBooks.has(bookHash);
                  const hasMultipleFiles = bookFiles.length > 1;
                  const bookSelected = isBookSelected(bookFiles);
                  const bookPartiallySelected = isBookPartiallySelected(bookFiles);

                  if (!mainFile) return null;

                  return (
                    <React.Fragment key={bookHash}>
                      {/* Main book row */}
                      <tr className='hover'>
                        <td>
                          <div className='flex items-center gap-1'>
                            <input
                              type='checkbox'
                              checked={bookSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = bookPartiallySelected;
                              }}
                              onChange={(e) => handleSelectBook(bookFiles, e.target.checked)}
                              disabled={loading}
                              className='checkbox checkbox-sm'
                            />
                            {hasMultipleFiles && (
                              <button
                                onClick={() => toggleBookExpansion(bookHash)}
                                className='btn btn-ghost btn-xs'
                              >
                                {isExpanded ? '−' : '+'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className='max-w-0 !ps-0 sm:w-[80%]'>
                          <div className='flex flex-col'>
                            <div className='flex items-center gap-2'>
                              <span className='text-base-content block max-w-full truncate font-medium'>
                                {getFileName(mainFile.file_key)}
                              </span>
                              {hasMultipleFiles && (
                                <span className='text-base-content/60 flex-shrink-0 whitespace-nowrap text-xs'>
                                  ({bookFiles.length} {_('files')})
                                </span>
                              )}
                            </div>
                            <span className='text-base-content/60 text-xs sm:hidden'>
                              {formatFileSize(getBookTotalSize(bookFiles))} ·{' '}
                              {formatDate(mainFile.created_at)}
                            </span>
                          </div>
                        </td>
                        <td className='hidden whitespace-nowrap sm:table-cell'>
                          {formatFileSize(getBookTotalSize(bookFiles))}
                        </td>
                        <td className='hidden whitespace-nowrap sm:table-cell'>
                          {formatDate(mainFile.created_at)}
                        </td>
                      </tr>

                      {/* Expanded files (excluding covers unless expanded) */}
                      {isExpanded &&
                        bookFiles.map((file) => (
                          <tr key={file.file_key} className='hover bg-base-200/50'>
                            <td>
                              <div className='pl-4'>
                                <input
                                  type='checkbox'
                                  checked={selectedFiles.has(file.file_key)}
                                  onChange={(e) =>
                                    handleSelectFile(file.file_key, e.target.checked)
                                  }
                                  disabled={loading}
                                  className='checkbox checkbox-sm'
                                />
                              </div>
                            </td>
                            <td className='max-w-0 !ps-0 sm:w-[80%]'>
                              <div className='flex flex-col'>
                                <span className='text-base-content/80 text-xs'>
                                  {getFileName(file.file_key)}
                                </span>
                              </div>
                            </td>
                            <td className='hidden sm:table-cell'>
                              {formatFileSize(file.file_size)}
                            </td>
                            <td className='hidden sm:table-cell'>{formatDate(file.created_at)}</td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className='border-base-300 flex items-center justify-between border-t p-4'>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className='btn btn-sm'
          >
            {_('Previous')}
          </button>
          <span className='text-base-content text-sm'>
            {_('Page {{current}} of {{total}}', { current: currentPage, total: totalPages })}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className='btn btn-sm'
          >
            {_('Next')}
          </button>
        </div>
      </div>

      {/* Confirm Delete Modal */}
      {showConfirmDelete && (
        <div
          className={clsx('fixed bottom-0 left-0 right-0 z-50 flex justify-center')}
          style={{
            paddingBottom: `${(safeAreaInsets?.bottom || 0) + 16}px`,
          }}
        >
          <Alert
            title={_('Confirm Deletion')}
            message={
              deletionPlan?.books.length
                ? _(
                    'Delete the selected cloud books, including their covers, cloud library entries and downloaded cloud copies, plus any other selected files? Separate device-local copies remain.',
                  )
                : _('Are you sure to delete {{count}} selected file(s)?', {
                    count: selectedFiles.size,
                  })
            }
            onCancel={() => {
              setShowConfirmDelete(false);
              setDeletionPlan(null);
            }}
            onConfirm={() => {
              handleDeleteSelected();
              setShowConfirmDelete(false);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default StorageManager;
