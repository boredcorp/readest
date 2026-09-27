import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), deleteObject: vi.fn() }));
vi.mock('@/utils/supabase', () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/integrations/learningbored/upload-session-server', () => ({
  deletePrivateReaderObject: mocks.deleteObject,
  ReaderUploadError: class ReaderUploadError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
import { deletePrivateReaderFile } from '@/integrations/learningbored/file-deletion';

const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const objectKey = `${owner}/book_attempt`;
describe('private Reader ordinary file deletion receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValueOnce({ data: { attemptId, sessionId: id, objectKey }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.deleteObject.mockResolvedValue(undefined);
  });
  it('commits the owner-scoped journal before exact-key DELETE and waits for a durable receipt', async () => {
    mocks.deleteObject.mockImplementation(async () => {
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('learningbored_begin_reader_file_delete', {
        p_user_id: owner,
        p_file_key: `${owner}/book`,
      });
    });
    expect(await deletePrivateReaderFile(owner, `${owner}/book`)).toBe(true);
    expect(mocks.deleteObject).toHaveBeenCalledWith(objectKey);
    expect(mocks.rpc).toHaveBeenLastCalledWith('learningbored_record_reader_file_delete', {
      p_user_id: owner,
      p_attempt_id: attemptId,
      p_success: true,
    });
  });
  it('keeps a lost response pending and records only unknown for that attempt', async () => {
    mocks.deleteObject.mockRejectedValue(new Error('response lost'));
    expect(await deletePrivateReaderFile(owner, `${owner}/book`)).toBe(false);
    expect(mocks.rpc).toHaveBeenLastCalledWith('learningbored_record_reader_file_delete', {
      p_user_id: owner,
      p_attempt_id: attemptId,
      p_success: false,
    });
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
  });
  it('does not claim success if the positive receipt is not durably recorded', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '08006' } });
    expect(await deletePrivateReaderFile(owner, `${owner}/book`)).toBe(false);
  });
  it('retains the legacy capability hold even after an exact-key positive delete', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await deletePrivateReaderFile(owner, `${owner}/book`)).toBe(false);
  });
  it('never dispatches when admission fails', async () => {
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { code: 'LB005' } });
    await expect(deletePrivateReaderFile(owner, `${owner}/book`)).rejects.toThrow('File not found');
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
  it('never dispatches a provider key outside the owner prefix', async () => {
    mocks.rpc.mockReset().mockResolvedValue({
      data: { attemptId, sessionId: id, objectKey: 'other/book' },
      error: null,
    });
    await expect(deletePrivateReaderFile(owner, `${owner}/book`)).rejects.toThrow('identity');
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
