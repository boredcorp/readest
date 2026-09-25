import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Book } from '@/types/book';
import CloudLibraryActions from '@/components/metadata/CloudLibraryActions';

const mocks = vi.hoisted(() => ({
  app: { appPlatform: 'web' },
  library: [],
  getState: vi.fn(),
  hasLocal: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  delete: vi.fn(),
  retry: vi.fn(),
  choose: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (text: string) => text }));
vi.mock('@/hooks/useAppRouter', () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/utils/nav', () => ({ navigateToReader: vi.fn() }));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (select: (state: { library: Book[] }) => unknown) =>
    select({ library: mocks.library }),
}));
vi.mock('@/services/cloudOwnerSession', () => ({ cloudSessionEpoch: () => 1 }));
vi.mock('@/app/library/hooks/useCloudLibrary', () => ({
  useCloudLibrary: () => ({
    appService: mocks.app,
    enabled: true,
    ownerEpoch: 1,
    isWorking: false,
    error: null,
    runAction: mocks.run,
  }),
}));
vi.mock('@/services/ordinaryCloudLibrary', () => ({
  getCloudBookState: mocks.getState,
  hasLocalLibraryCopy: mocks.hasLocal,
  uploadOrdinaryBook: mocks.upload,
  removeCloudDownload: mocks.remove,
  deleteOrdinaryCloudBook: mocks.delete,
  retryCloudBook: mocks.retry,
  chooseCloudLibraryCopy: mocks.choose,
}));

const book = (cloud = false): Book => ({
  hash: '1'.repeat(32),
  title: 'The Lantern Path',
  author: 'Fixture',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 2,
  downloadedAt: 3,
  libraryOrigin: cloud ? { kind: 'cloud', ownerKey: 'a'.repeat(64), epoch: 1 } : { kind: 'local' },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getState.mockResolvedValue(null);
  mocks.hasLocal.mockResolvedValue(true);
  mocks.run.mockImplementation(async (action: (app: object) => Promise<void>) => {
    try {
      await action(mocks.app);
      return true;
    } catch {
      return false;
    }
  });
});
afterEach(cleanup);

describe('ordinary cloud library actions', () => {
  it('does not upload a local book until its explicit action is selected', async () => {
    render(<CloudLibraryActions book={book()} />);
    const upload = await screen.findByRole('button', { name: 'Upload to cloud library' });
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(upload);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(mocks.app, book()));
  });

  it('requires explicit confirmation for remote deletion', async () => {
    mocks.getState.mockResolvedValue({ book: book(true), state: 'ready', revision: 1 });
    render(<CloudLibraryActions book={book(true)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete from cloud library' }));
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(screen.getByText(/A separate local copy remains/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cloud deletion' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledTimes(1));
  });

  it('allows explicit re-upload of a separate local copy after confirmed cloud deletion', async () => {
    mocks.getState.mockResolvedValue({
      book: { ...book(), deletedAt: 4 },
      state: 'tombstoned',
      revision: 3,
    });
    render(<CloudLibraryActions book={book()} />);
    const upload = await screen.findByRole('button', { name: 'Upload to cloud library' });
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(upload);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(mocks.app, book()));
  });

  it('removes only the download through the separate cache action', async () => {
    mocks.getState.mockResolvedValue({ book: book(true), state: 'ready', revision: 1 });
    render(<CloudLibraryActions book={book(true)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove downloaded cloud copy' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('keeps pending deletion distinct from available cloud content', async () => {
    mocks.getState.mockResolvedValue({ book: book(true), state: 'delete_pending', revision: 2 });
    render(<CloudLibraryActions book={book(true)} />);
    expect(await screen.findByText('Cloud deletion is pending. Retry to finish.')).toBeTruthy();
    expect(screen.queryByText('Available in cloud library')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open cloud copy' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry cloud deletion' })).toBeTruthy();
  });
});
