'use client';

import { useEffect, useMemo, useState } from 'react';

import type { Book } from '@/types/book';
import { getLearningBoredBookId } from './book';
import type { LearningBoredDocumentSummary } from './client';
import { useLearningBoredClient } from './LearningBoredClientContext';

export type LearningBoredLibraryDocumentMap = ReadonlyMap<string, LearningBoredDocumentSummary>;
export type LearningBoredLibraryEnrichmentStatus = 'loading' | 'available' | 'unavailable';

function documentForBook(
  book: Book,
  documentsByReaderBookId: LearningBoredLibraryDocumentMap,
): LearningBoredDocumentSummary | undefined {
  return documentsByReaderBookId.get(getLearningBoredBookId(book.hash, book));
}

export function useLearningBoredLibraryDocuments(): {
  documentsByReaderBookId: LearningBoredLibraryDocumentMap;
  status: LearningBoredLibraryEnrichmentStatus;
} {
  const client = useLearningBoredClient();
  const [documents, setDocuments] = useState<LearningBoredDocumentSummary[]>([]);
  const [status, setStatus] = useState<LearningBoredLibraryEnrichmentStatus>('loading');

  useEffect(() => {
    if (!client) {
      setDocuments([]);
      setStatus('unavailable');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    void client
      .listDocuments({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setDocuments(result.documents);
          setStatus('available');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDocuments([]);
          setStatus('unavailable');
        }
      });
    return () => controller.abort();
  }, [client]);

  const documentsByReaderBookId = useMemo(() => {
    const mapped = new Map<string, LearningBoredDocumentSummary>();
    for (const document of documents) {
      if (document.readerBookId) mapped.set(document.readerBookId, document);
    }
    return mapped;
  }, [documents]);

  return { documentsByReaderBookId, status };
}

export function getLearningBoredDocumentForBook(
  book: Book,
  documentsByReaderBookId: LearningBoredLibraryDocumentMap,
): LearningBoredDocumentSummary | undefined {
  return documentForBook(book, documentsByReaderBookId);
}
